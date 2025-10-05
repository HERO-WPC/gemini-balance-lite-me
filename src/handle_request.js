// --- 修改后的 handle_request.js 文件开始 ---

import { handleVerification } from './verify_keys.js';
import openai from './openai.mjs';

// 
// 配置区域:
// 将此处的域名替换为您在 DNS 中设置的用于转发的域名。
const FORWARDING_HOSTNAME = 'forward.herowpc.dpdns.org';
// 

export async function handleRequest(request) {

  const url = new URL(request.url);

  // 
  // 核心转发逻辑:
  // 检查请求是否来自香港数据中心 ('HKG')，
  // 同时确保这个请求不是已经被转发过的请求（通过检查主机名来避免无限循环）。
  if (request.cf?.colo === 'HKG' && url.hostname !== FORWARDING_HOSTNAME) {
    
    // 创建一个新的 URL 对象，用我们的转发域名替换掉原始的域名。
    const newUrl = new URL(request.url);
    newUrl.hostname = FORWARDING_HOSTNAME;

    console.log(`检测到来自香港节点的请求。正在通过 ${newUrl.toString()} 转发到美国节点...`);

    // 基于原始请求，创建一个指向新 URL 的新请求。
    // 这实际上是在 Worker 内部重新发起了一次请求。
    // 由于您创建的 DNS 记录，这次 fetch 请求将被解析到您指定的美国 IP。
    const newRequest = new Request(newUrl, request);
    
    // 执行这次新的 fetch 请求，并直接返回它的响应。
    // 香港节点的 Worker 执行到这里就结束了，不会再运行下面的代码。
    return fetch(newRequest);
  }
  // --- 转发逻辑结束 ---
  // 如果请求不是来自香港，或者已经是被转发过来的请求，
  // 那么下面的原始代码会照常执行。
  // 


  // --- 原始代码继续在非香港节点或已转发的请求上运行 ---
  const pathname = url.pathname;
  const search = url.search;

  if (pathname === '/' || pathname === '/index.html') {
    return new Response('Proxy is Running!  More Details: https://github.com/tech-shrimp/gemini-balance-lite', {
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    });
  }

  if (pathname === '/verify' && request.method === 'POST') {
    return handleVerification(request);
  }

  // 处理OpenAI格式请求
  if (url.pathname.endsWith("/chat/completions") || url.pathname.endsWith("/completions") || url.pathname.endsWith("/embeddings") || url.pathname.endsWith("/models")) {
    return openai.fetch(request);
  }

  const targetUrl = `https://generativelanguage.googleapis.com${pathname}${search}`;

  try {
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (key.trim().toLowerCase() === 'x-goog-api-key') {
        const apiKeys = value.split(',').map(k => k.trim()).filter(k => k);
        if (apiKeys.length > 0) {
          const selectedKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];
          // 为了日志安全，只打印部分key
          console.log(`Gemini 已选择 API Key: ${selectedKey.substring(0, 4)}...`);
          headers.set('x-goog-api-key', selectedKey);
        }
      } else {
        if (key.trim().toLowerCase()==='content-type')
        {
           headers.set(key, value);
        }
      }
    }

    // 增加当前处理节点位置的日志
    console.log(`请求在 ${request.cf?.colo || '未知地区'} 处理。正在发往 Gemini...`);
    console.log('目标URL:' + targetUrl);
    
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.body
    });

    console.log("调用 Gemini API 成功");

    const responseHeaders = new Headers(response.headers);

    responseHeaders.delete('transfer-encoding');
    responseHeaders.delete('connection');
    responseHeaders.delete('keep-alive');
    responseHeaders.delete('content-encoding');
    responseHeaders.set('Referrer-Policy', 'no-referrer');

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (error) {
   console.error('Fetch 失败:', error);
   return new Response('内部服务器错误\n' + error?.stack, {
    status: 500,
    headers: { 'Content-Type': 'text/plain' }
   });
  }
};

// --- 修改后的 handle_request.js 文件结束 ---