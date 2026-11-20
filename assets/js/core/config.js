'use strict';

const PROD_HOST = 'thatdp.github.io';
const PROD_BACKEND_HOST = 'lumen-server-xiye.onrender.com';

const isProd = typeof location !== 'undefined' && location.hostname === PROD_HOST;

export const CONFIG = {
  isProd,
  PROD_ORIGIN: `https://${PROD_HOST}`,
  API_BASE: isProd ? `https://${PROD_BACKEND_HOST}` : '',
  WS_URL: isProd
    ? `wss://${PROD_BACKEND_HOST}`
    : (typeof location !== 'undefined'
        ? `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`
        : 'ws://127.0.0.1:3000'),
  ENDPOINTS: {
    ice: '/api/ice',
    rooms: '/api/rooms',
    health: '/api/health'
  }
};
