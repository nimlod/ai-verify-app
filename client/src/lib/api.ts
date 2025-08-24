
import axios from 'axios'
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
export const AUTHLOG_URL = import.meta.env.VITE_AUTHLOG_URL || 'http://localhost:4000'
export const server = axios.create({ baseURL: SERVER_URL })
export const authlog = axios.create({ baseURL: AUTHLOG_URL })
