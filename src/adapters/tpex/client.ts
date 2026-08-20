import axios from 'axios';

const TPEX_API_BASE_URL = 'https://www.tpex.org.tw/openapi/v1';

export const apiClient = axios.create({
  baseURL: TPEX_API_BASE_URL,
  headers: { Accept: 'application/json' },
  timeout: 10000,
});
