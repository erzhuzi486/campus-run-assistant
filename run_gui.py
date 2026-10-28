# -*- coding: utf-8 -*-
"""校园跑 · 一键投喂器（精美版）

东1田径场 · 第3道 · 3 圈 · 1 Hz
跑完或手动停止后可选择：原地停 / 回到起点
"""
import math
import os
import queue
import shutil
import subprocess
import threading
import time
import tkinter as tk
from tkinter import scrolledtext

try:
    from PIL import Image, ImageTk
    HAS_PIL = True
except Exception:
    HAS_PIL = False

# ---------------- 配置 ----------------
# 定位 ldconsole.exe：环境变量 > PATH > 常见安装目录 > 盘符扫描
LDCONSOLE_ENV = "LDCONSOLE"          # 手动指定：set LDCONSOLE=D:\xxx\ldconsole.exe
SEARCH_DIRS = [
    r"D:\leidian\LDPlayer9",
    r"D:\leidian\LDPlayer14",
    r"D:\LDPlayer\LDPlayer9",
    r"D:\LDPlayer\LDPlayer14",
    r"D:\雷电模拟器\leidian\LDPlayer9",
    r"D:\雷电模拟器\leidian\LDPlayer14",
    r"C:\LDPlayer\LDPlayer9",
    r"C:\LDPlayer\LDPlayer14",
    r"C:\Program Files\LDPlayer\LDPlayer9",
    r"C:\Program Files\LDPlayer\LDPlayer14",
]


def _scan_drives():
    """在盘符根目录下浅扫两层，兜底找 ldconsole.exe"""
    import glob
    found = []
    for drive in "CDEFG":
        root = drive + ":\\"
        if not os.path.exists(root):
            continue
        for pat in ("*/ldconsole.exe", "*/*/ldconsole.exe", "*/*/*/ldconsole.exe"):
            try:
                found.extend(glob.glob(os.path.join(root, pat)))
            except Exception:
                pass
            if found:
                return found
    return found


def _candidates():
    cands = []
    env = os.environ.get(LDCONSOLE_ENV, "").strip('"')
    if env:
        cands.append(env)
    for d in SEARCH_DIRS:
        cands.append(os.path.join(d, "ldconsole.exe"))
    w = shutil.which("ldconsole") or shutil.which("ldconsole.exe")
    if w:
        cands.append(w)
    cands.extend(_scan_drives())
    seen, out = set(), []
    for c in cands:
        if c and c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _pick_ldconsole():
    """返回 (路径, 状态)。优先运行中的实例，其次第一个存在的。"""
    cands = _candidates()
    existing = [c for c in cands if os.path.exists(c)]
    if not existing:
        return (cands[0] if cands else "ldconsole.exe"), "未找到"
    for c in existing:
        try:
            out = subprocess.run([c, "list2"], capture_output=True, timeout=8)
            for line in out.stdout.decode("gbk", "ignore").splitlines():
                cols = line.split(",")
                if len(cols) >= 5 and cols[4].strip() == "1":
                    return c, "运行中"
        except Exception:
            continue
    return existing[0], "未启动"


LDCONSOLE, LDCONSOLE_STATE = _pick_ldconsole()
INDEX = "0"
FISH_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fish.png")

CENTER_LAT, CENTER_LNG = 39.203921, 118.595184
LANE_R = 40.2
STRAIGHT = 84.39
LAPS = 3
PACE_SEC = 330
HZ = 1.0
R_IN, R_OUT = 36.5, 46.3      # 跑道内外沿

# ---------------- 配色 ----------------
BG = "#0b1220"
PANEL = "#121c31"
PANEL2 = "#17233d"
CARD = "#1b2a45"
TEXT = "#e6edf7"
MUTED = "#8aa0bf"
CYAN = "#22d3ee"
GREEN = "#22c55e"
RED = "#ef4444"
TRACK = "#b4451f"
TRACK2 = "#8f3517"
INFIELD = "#14532d"
LINE = "#f1f5f9"

H = STRAIGHT / 2.0
PER = 4 * H + 2 * math.pi * LANE_R
TOTAL_M = PER * LAPS
SPEED = 1000.0 / PACE_SEC
KF = 111320.0 * math.cos(math.radians(CENTER_LAT))


def route_point(d):
    d = d % PER
    if d < 2 * H:
        return (-H + d, -LANE_R)
    d -= 2 * H
    if d < math.pi * LANE_R:
        th = -math.pi / 2 + d / LANE_R
        return (H + LANE_R * math.cos(th), LANE_R * math.sin(th))
    d -= math.pi * LANE_R
    if d < 2 * H:
        return (H - d, LANE_R)
    d -= 2 * H
    th = math.pi / 2 + d / LANE_R
    return (-H + LANE_R * math.cos(th), LANE_R * math.sin(th))


def to_geo(u, v):
    return CENTER_LAT + u / 111320.0, CENTER_LNG + v / KF


N_PTS = int(round(TOTAL_M / SPEED * HZ))
ROUTE = [(i * SPEED / HZ,) + to_geo(*route_point(i * SPEED / HZ)) for i in range(N_PTS)]
START_LAT, START_LNG = ROUTE[0][1], ROUTE[0][2]


def stadium(r, n=88):
    """体育场形闭合路径，(u=北, v=东) 米"""
    pts = []
    for i in range(n):
        pts.append((-H + 2 * H * i / (n - 1.0), -r))
    for i in range(1, n):
        th = -math.pi / 2 + math.pi * i / n
        pts.append((H + r * math.cos(th), r * math.sin(th)))
    for i in range(n):
        pts.append((H - 2 * H * i / (n - 1.0), r))
    for i in range(1, n):
        th = math.pi / 2 + math.pi * i / n
        pts.append((-H + r * math.cos(th), r * math.sin(th)))
    return pts


def locate(lat, lng):
    subprocess.run([LDCONSOLE, "locate", "--index", INDEX, "--LLI", "%.6f,%.6f" % (lng, lat)],
                   capture_output=True, timeout=10,
                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


class FishSprite:
    """把你的 fish.png 预旋转成一圈角度，动画时按航向取图"""
    def __init__(self, path, size=58, steps=36):
        self.ok = False
        self.imgs = []
        self.size = size
        if not (HAS_PIL and os.path.exists(path)):
            return
        try:
            im = Image.open(path).convert("RGBA")
            bbox = im.getbbox()
            if bbox:
                im = im.crop(bbox)
            w, h = im.size
            k = size / float(max(w, h))
            im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
            canvas = Image.new("RGBA", (size + 14, size + 14), (0, 0, 0, 0))
            canvas.paste(im, ((size + 14 - im.size[0]) // 2, (size + 14 - im.size[1]) // 2), im)
            for i in range(steps):
                rot = canvas.rotate(-i * (360.0 / steps), resample=Image.BICUBIC, expand=False)
                self.imgs.append(ImageTk.PhotoImage(rot))
            self.ok = True
        except Exception:
            self.ok = False

    def get(self, ang_deg):
        if not self.ok:
            return None
        idx = int(round(ang_deg / (360.0 / len(self.imgs)))) % len(self.imgs)
        return self.imgs[idx]


class Runner:
    def __init__(self, cv, x0, y0, w, h):
        self.cv = cv
        self.tag = "runner"
        self.trail = []

    def clear(self):
        self.cv.delete(self.tag)

    def draw_fish_vector(self, x, y, ang, scale=1.0):
        """没有 fish.png 时手绘一条胖鱼"""
        cv = self.cv
        pts = [(18, 0), (6, -11), (-8, -13), (-16, -6), (-16, 6), (-8, 13), (6, 11)]
        tail = [(-16, -2), (-27, -11), (-24, 0), (-27, 11), (-16, 2)]
        body, tl = [], []
        ca, sa = math.cos(ang), math.sin(ang)
        for px, py in pts:
            body += [x + (px * ca - py * sa) * scale, y + (px * sa + py * ca) * scale]
        for px, py in tail:
            tl += [x + (px * ca - py * sa) * scale, y + (px * sa + py * ca) * scale]
        cv.create_polygon(tl, fill="#3b6cf6", outline="", tags=self.tag)
        cv.create_polygon(body, fill="#4d6bfe", outline="#c7d2fe", width=1.5, smooth=True, tags=self.tag)
        ex = x + (8 * ca - 0) * scale
        ey = y + (8 * sa - 0) * scale
        cv.create_oval(ex - 3 * scale, ey - 3 * scale, ex + 3 * scale, ey + 3 * scale,
                       fill="white", outline="", tags=self.tag)
        cv.create_oval(ex - 1.2 * scale, ey - 1.2 * scale, ex + 1.2 * scale, ey + 1.2 * scale,
                       fill="#0b1220", outline="", tags=self.tag)


class MapView(tk.Canvas):
    def __init__(self, master, w=660, h=620):
        super().__init__(master, width=w, height=h, bg=BG, highlightthickness=0)
        self.W, self.H = w, h
        self.sprite = FishSprite(FISH_PATH)
        self.runner = Runner(self, 0, 0, w, h)
        self.fit()
        self.draw_static()

    def fit(self):
        us = [route_point(i * 0.5)[0] for i in range(int(PER * 2))]
        vs = [route_point(i * 0.5)[1] for i in range(int(PER * 2))]
        u0, u1 = min(us) - 12, max(us) + 12
        v0, v1 = min(vs) - 12, max(vs) + 12
        pad = 46
        s = min((self.W - 2 * pad) / (v1 - v0), (self.H - 2 * pad) / (u1 - u0))
        self.s = s
        self.cx = self.W / 2.0 - ((v0 + v1) / 2.0) * s
        self.cy = self.H / 2.0 + ((u0 + u1) / 2.0) * s

    def px(self, u, v):
        return self.cx + v * self.s, self.cy - u * self.s

    def draw_static(self):
        cv = self
        # 背景网格
        for i in range(0, self.W, 40):
            cv.create_line(i, 0, i, self.H, fill="#0f1a2e")
        for j in range(0, self.H, 40):
            cv.create_line(0, j, self.W, j, fill="#0f1a2e")

        # 内场
        inner = stadium(R_IN - 1.2)
        poly = []
        for u, v in inner:
            poly += list(self.px(u, v))
        cv.create_polygon(poly, fill=INFIELD, outline="", smooth=True)
        # 内场纹理
        for k in range(-4, 5):
            u = k * 18
            a = self.px(u, -(R_IN - 2))
            b = self.px(u, (R_IN - 2))
            cv.create_line(a[0], a[1], b[0], b[1], fill="#186b3a", width=1)

        # 跑道环（外沿 + 内沿反向，填充出环形）
        outer = stadium(R_OUT)
        inn = stadium(R_IN)
        ring = []
        for u, v in outer:
            ring += list(self.px(u, v))
        for u, v in reversed(inn):
            ring += list(self.px(u, v))
        cv.create_polygon(ring, fill=TRACK, outline="#6b2a12", width=1, smooth=True)

        # 分道线
        for k in range(9):
            r = R_IN + k * (R_OUT - R_IN) / 8.0
            pts = []
            for u, v in stadium(r, 72):
                pts += list(self.px(u, v))
            pts += pts[:2]
            cv.create_line(pts, fill=LINE, width=1, smooth=True)

        # 起终点线
        u0, v0 = route_point(0.0)
        p1 = self.px(-H + 0.0, -R_OUT)
        p2 = self.px(-H + 0.0, -R_IN)
        cv.create_line(p1[0], p1[1], p2[0], p2[1], fill="#fde047", width=3)

        # 指北针
        ax, ay = self.W - 52, 56
        cv.create_oval(ax - 18, ay - 18, ax + 18, ay + 18, outline=MUTED, width=1)
        cv.create_line(ax, ay + 12, ax, ay - 12, fill=CYAN, width=2, arrow="last", arrowshape=(8, 10, 4))
        cv.create_text(ax, ay + 28, text="N", fill=MUTED, font=("Consolas", 9))

        # 比例尺 100 m
        sx, sy = 26, self.H - 30
        L100 = 100 * self.s
        cv.create_line(sx, sy, sx + L100, sy, fill=MUTED, width=2)
        cv.create_line(sx, sy - 4, sx, sy + 4, fill=MUTED, width=2)
        cv.create_line(sx + L100, sy - 4, sx + L100, sy + 4, fill=MUTED, width=2)
        cv.create_text(sx + L100 / 2, sy - 12, text="100 m", fill=MUTED, font=("Consolas", 9))

        cv.create_text(18, 20, text="东1田径场 · 第3道", anchor="w",
                       fill=TEXT, font=("Microsoft YaHei", 11, "bold"))

    def draw_dynamic(self, idx_float, trail_idx=None):
        cv = self
        cv.delete("dyn")
        # 拖尾
        n = len(ROUTE)
        start = max(0, int(idx_float) - 46)
        pts = []
        for i in range(start, min(n, int(idx_float) + 1)):
            u, v = route_point(i * SPEED)
            x, y = self.px(u, v)
            pts += [x, y]
        xu, xv = route_point(idx_float * SPEED)
        fx, fy = self.px(xu, xv)
        pts += [fx, fy]
        if len(pts) >= 4:
            cv.create_line(pts, fill="#0e7490", width=7, smooth=True, tags="dyn")
            cv.create_line(pts, fill=CYAN, width=3, smooth=True, tags="dyn")

        # 光晕
        for rr, col in ((26, "#0e7490"), (18, "#22d3ee")):
            cv.create_oval(fx - rr, fy - rr, fx + rr, fy + rr, outline=col, width=1, tags="dyn")

        # 航向
        i0 = max(0, int(idx_float) - 1)
        i1 = min(len(ROUTE) - 1, i0 + 1)
        ua, va = route_point(i0 * SPEED)
        ub, vb = route_point(i1 * SPEED)
        dx = (vb - va) * self.s
        dy = -(ub - ua) * self.s
        ang = math.degrees(math.atan2(dy, dx))

        img = self.sprite.get(ang)
        if img is not None:
            cv.create_image(fx, fy, image=img, tags="dyn")
            self._keep = img
        else:
            self.runner.tag = "dyn"
            self.runner.draw_fish_vector(fx, fy, math.radians(ang), 1.15)


class App:
    def __init__(self, root):
        self.root = root
        self.stop_flag = threading.Event()
        self.worker = None
        self.running = False
        self.t0 = None
        self.frozen_idx = 0.0

        root.title("校园跑 · 一键投喂器")
        root.configure(bg=BG)
        root.geometry("1140x700")
        root.resizable(False, False)

        wrap = tk.Frame(root, bg=BG)
        wrap.pack(fill="both", expand=True, padx=10, pady=10)

        self.map = MapView(wrap, 660, 620)
        self.map.pack(side="left", fill="both", expand=True)

        right = tk.Frame(wrap, bg=BG, width=440)
        right.pack(side="left", fill="both", padx=(12, 0))
        right.pack_propagate(False)

        head = tk.Frame(right, bg=BG)
        head.pack(fill="x", pady=(4, 10))
        tk.Label(head, text="校园跑", bg=BG, fg=TEXT,
                 font=("Microsoft YaHei", 20, "bold")).pack(anchor="w")
        tk.Label(head, text="2026 年秋季 · 阳光跑 · 第 3 圈道", bg=BG, fg=MUTED,
                 font=("Microsoft YaHei", 9)).pack(anchor="w")

        cards = tk.Frame(right, bg=BG)
        cards.pack(fill="x")
        self.v_dist = tk.StringVar(value="0")
        self.v_time = tk.StringVar(value="00:00")
        self.v_pace = tk.StringVar(value="--'--\"")
        for i, (t, var, unit) in enumerate([("距离", self.v_dist, "m"),
                                           ("用时", self.v_time, ""),
                                           ("配速", self.v_pace, "/km")]):
            c = tk.Frame(cards, bg=CARD)
            c.grid(row=0, column=i, padx=(0, 8), sticky="nsew")
            cards.columnconfigure(i, weight=1)
            tk.Label(c, text=t, bg=CARD, fg=MUTED, font=("Microsoft YaHei", 9)).pack(anchor="w", padx=12, pady=(10, 0))
            row = tk.Frame(c, bg=CARD)
            row.pack(anchor="w", padx=12)
            tk.Label(row, textvariable=var, bg=CARD, fg=TEXT,
                     font=("Consolas", 20, "bold")).pack(side="left")
            tk.Label(row, text=unit, bg=CARD, fg=MUTED, font=("Consolas", 9)).pack(side="left", pady=(8, 0))
            tk.Frame(c, bg=CARD, height=8).pack()

        self.lbl_lap = tk.Label(right, text="第 0 / %d 圈" % LAPS, bg=BG, fg=MUTED,
                                font=("Microsoft YaHei", 9))
        self.lbl_lap.pack(anchor="w", pady=(12, 4))
        self.bar_bg = tk.Frame(right, bg=PANEL2, height=8)
        self.bar_bg.pack(fill="x")
        self.bar_fg = tk.Frame(self.bar_bg, bg=CYAN, height=8)
        self.bar_fg.place(x=0, y=0, relheight=1, relwidth=0)

        self.btn_run = tk.Button(right, text="▶   开 始 跑", command=self.start,
                                 bg=GREEN, fg="white", activebackground="#16a34a",
                                 font=("Microsoft YaHei", 15, "bold"), relief="flat",
                                 height=2, cursor="hand2", bd=0)
        self.btn_run.pack(fill="x", pady=(18, 8))

        row = tk.Frame(right, bg=BG)
        row.pack(fill="x")
        self.btn_stop = tk.Button(row, text="■ 停止", command=self.stop, state="disabled",
                                  bg=PANEL2, fg=TEXT, activebackground="#243454",
                                  font=("Microsoft YaHei", 11), relief="flat", height=2, bd=0)
        self.btn_stop.pack(side="left", fill="x", expand=True, padx=(0, 6))
        tk.Button(row, text="⟲ 回起点", command=self.park, bg=PANEL2, fg=TEXT,
                  activebackground="#243454", font=("Microsoft YaHei", 11),
                  relief="flat", height=2, bd=0).pack(side="left", fill="x", expand=True)

        self.log = scrolledtext.ScrolledText(right, height=7, bg=PANEL, fg=MUTED,
                                             font=("Consolas", 9), relief="flat",
                                             insertbackground=TEXT, bd=0)
        self.log.pack(fill="both", expand=True, pady=(12, 0))

        self.q = queue.Queue()
        self.root.after(100, self.drain)
        self.root.after(33, self.tick)
        self.w("就绪：起点 = 终点 = %.6f, %.6f" % (START_LAT, START_LNG))
        self.w("鱼素材：" + ("已载入 fish.png" if self.map.sprite.ok else "未找到 fish.png，使用手绘矢量鱼"))

    def w(self, msg):
        self.q.put(msg)

    def drain(self):
        try:
            while True:
                self.log.insert("end", time.strftime("%H:%M:%S ") + self.q.get_nowait() + "\n")
                self.log.see("end")
        except queue.Empty:
            pass
        self.root.after(100, self.drain)

    def idx_at(self, elapsed):
        return max(0.0, min(float(len(ROUTE) - 1), elapsed * SPEED / SPEED))

    def tick(self):
        if self.running and self.t0:
            el = time.monotonic() - self.t0
            idx = min(len(ROUTE) - 1.0, el * HZ)
            self.frozen_idx = idx
        else:
            idx = self.frozen_idx
        self.map.draw_dynamic(idx)
        dist = min(TOTAL_M, idx * SPEED)
        self.v_dist.set("%.0f" % dist)
        sec = int(idx * SPEED / SPEED)
        self.v_time.set("%02d:%02d" % (sec // 60, sec % 60))
        if dist > 25:
            self.v_pace.set("%d'%02d\"" % (PACE_SEC // 60, PACE_SEC % 60))
        lap = min(LAPS, int(dist / PER) + (1 if dist < TOTAL_M - 0.5 else 0))
        self.lbl_lap.config(text="第 %d / %d 圈" % (lap, LAPS))
        self.bar_fg.place_configure(relwidth=min(1.0, idx / max(1, len(ROUTE) - 1)))
        self.root.after(33, self.tick)

    def park(self):
        try:
            locate(START_LAT, START_LNG)
            self.w("已回到起点")
        except Exception as e:
            self.w("回起点失败: %s" % e)

    def start(self):
        if self.worker and self.worker.is_alive():
            return
        self.stop_flag.clear()
        self.running = True
        self.t0 = time.monotonic()
        self.frozen_idx = 0.0
        self.btn_run.config(state="disabled", bg="#15803d")
        self.btn_stop.config(state="normal")
        self.worker = threading.Thread(target=self.run_route, daemon=True)
        self.worker.start()

    def stop(self):
        self.stop_flag.set()
        self.running = False
        self.t0 = None
        self.btn_stop.config(state="disabled")
        self.w("收到停止指令…")

    def run_route(self):
        self.w("开始：%d 点 / %.0f m" % (len(ROUTE), TOTAL_M))
        ok = 0
        finished = False
        try:
            locate(START_LAT, START_LNG)
            time.sleep(0.8)
        except Exception as e:
            self.w("起点定位失败: %s" % e)
        for i in range(len(ROUTE)):
            if self.stop_flag.is_set():
                self.w("手动停止，已投喂 %d 点" % i)
                break
            try:
                locate(ROUTE[i][1], ROUTE[i][2])
                ok += 1
            except Exception as e:
                self.w("第 %d 点失败: %s" % (i, e))
            time.sleep(0.76)
        else:
            finished = True
            self.w("完成：%d 点 / %.0f m" % (ok, TOTAL_M))
        self.root.after(0, lambda: self.done(finished, ok))

    def done(self, finished, ok):
        self.running = False
        self.t0 = None
        self.btn_stop.config(state="disabled")
        if finished:
            self.frozen_idx = len(ROUTE) - 1.0
            self.w("三圈结束，已回到起点")
        self.ask_after(finished, ok)

    def ask_after(self, finished, ok):
        win = tk.Toplevel(self.root)
        win.title("停下位置")
        win.configure(bg=PANEL)
        win.transient(self.root)
        win.resizable(False, False)
        win.grab_set()
        title = "三圈跑完" if finished else "已手动停止"
        tk.Label(win, text=title, bg=PANEL, fg=TEXT,
                 font=("Microsoft YaHei", 15, "bold")).pack(padx=30, pady=(22, 4))
        tk.Label(win, text="想让定位停在哪里？", bg=PANEL, fg=MUTED,
                 font=("Microsoft YaHei", 10)).pack(padx=30)
        tk.Label(win, text="原地停：保持当前位置\n回起点：拉回 %.6f, %.6f" % (START_LAT, START_LNG),
                 bg=PANEL, fg=MUTED, font=("Consolas", 9), justify="left").pack(padx=30, pady=(8, 14), anchor="w")
        rw = tk.Frame(win, bg=PANEL)
        rw.pack(pady=(0, 20))

        def stay():
            win.destroy()
            self.btn_run.config(state="normal", bg=GREEN)
            self.w("选择：原地停留")

        def back():
            win.destroy()
            self.btn_run.config(state="normal", bg=GREEN)
            self.w("选择：回到起点")
            self.park()

        tk.Button(rw, text="📍 在原地停", command=stay, bg=PANEL2, fg=TEXT,
                  font=("Microsoft YaHei", 11), relief="flat", width=13, height=2, bd=0).pack(side="left", padx=7)
        tk.Button(rw, text="⟲ 回到起点", command=back, bg="#2563eb", fg="white",
                  font=("Microsoft YaHei", 11), relief="flat", width=13, height=2, bd=0).pack(side="left", padx=7)
        win.protocol("WM_DELETE_WINDOW", stay)
        win.update_idletasks()
        x = self.root.winfo_x() + (self.root.winfo_width() - win.winfo_width()) // 2
        y = self.root.winfo_y() + (self.root.winfo_height() - win.winfo_height()) // 2
        win.geometry("+%d+%d" % (max(0, x), max(0, y)))
        win.wait_window()


if __name__ == "__main__":
    root = tk.Tk()
    App(root)
    root.mainloop()
