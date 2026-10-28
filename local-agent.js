#!/usr/bin/env node
/**
 * local-agent.js — 配速规划台的本地 AI 桥
 *
 * 为什么需要它：
 *   index.html 是 file:// 打开的本地页面，浏览器直连 https://api.deepseek.com
 *   会被 CORS 拦掉，所以由这个不到百行的本地服务转发一次。
 *
 * 用法：
 *   node local-agent.js                    # 默认 http://127.0.0.1:8787
 *   PORT=9000 node local-agent.js          # 换端口
 *
 * 然后在 index.html 的「桥地址」里填 http://127.0.0.1:8787 即可。
 * API Key 由页面自己填，只会透传到上游，本服务不落盘、不打印。
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 120000);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (chunk) => {
      buf += chunk;
      if (buf.length > 1e6) {
        req.destroy();
        reject(new Error('请求体过大'));
      }
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

function postJson(urlStr, headers, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'http:' ? http : https;
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + u.search,
        method: 'POST',
        headers: Object.assign({}, headers, {
          'Content-Type': 'application/json',
          'Content-Length': data.length,
        }),
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      }
    );
    req.on('error', reject);
    req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('上游超时')));
    req.write(data);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method !== 'POST' || !req.url.split('?')[0].startsWith('/ai')) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: '只支持 POST /ai' }));
  }

  try {
    const raw = await readBody(req);
    const { key, model, baseUrl, messages } = JSON.parse(raw || '{}');

    if (!key) throw new Error('缺少 API Key');
    if (!Array.isArray(messages) || !messages.length) throw new Error('messages 为空');

    const base = String(baseUrl || 'https://api.deepseek.com').replace(/\/+$/, '');
    const upstream = await postJson(
      base + '/chat/completions',
      { Authorization: 'Bearer ' + key },
      {
        model: model || 'deepseek-chat',
        messages,
        temperature: 0.6,
        max_tokens: 800,
        stream: false,
      }
    );

    if (upstream.status < 200 || upstream.status >= 300) {
      throw new Error('上游 HTTP ' + upstream.status + '：' + upstream.body.slice(0, 200));
    }

    const j = JSON.parse(upstream.body);
    const content =
      (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ content }));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: String((e && e.message) || e) }));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('[local-agent] 端口 ' + PORT + ' 已被占用，换一个：PORT=9000 node local-agent.js');
  } else {
    console.error('[local-agent] 启动失败：', e.message);
  }
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log('[local-agent] 桥已启动 → http://' + HOST + ':' + PORT + '/ai');
  console.log('[local-agent] 在配速规划台的「桥地址」里填 http://' + HOST + ':' + PORT);
  console.log('[local-agent] API Key 由页面传入，仅透传给上游，不落盘');
});
