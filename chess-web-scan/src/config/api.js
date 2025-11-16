/**
 * Centralized API Configuration
 * 
 * All API base URLs should be imported from here.
 * Update VITE_API_BASE_URL in .env to change the backend URL.
 */

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8001';

export default API_BASE_URL;

