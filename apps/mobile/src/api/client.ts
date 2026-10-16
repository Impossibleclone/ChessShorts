import axios, { AxiosInstance, AxiosError } from 'axios';
import { FeedResponse, SubmitProgressRequest, ApiError, UserProgress } from '@/types';
import { MMKV } from 'react-native-mmkv';
import Constants from 'expo-constants';

const storage = new MMKV();

// Support multiple ways to configure the API URL:
// 1. EXPO_PUBLIC_API_URL env var (set in eas.json or .env)
// 2. Constants.expoConfig.extra.apiUrl (app.config.js)
// 3. Default: localhost:8000 (works with `adb reverse tcp:8000 tcp:8000` on Android)
// 4. Production: https://api.chessshorts.com
const getApiBaseUrl = (): string => {
  // Check env var first (set by Expo/Metro)
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;

  // Check app.config.js extra config
  const configUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configUrl) return configUrl;

  // Default for development with adb reverse
  if (__DEV__) {
    return 'http://localhost:8000';
  }

  return 'https://api.chessshorts.com';
};

const API_BASE_URL = getApiBaseUrl();

class ApiClient {
  private client: AxiosInstance;
  private userId: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config) => {
      if (this.userId) {
        config.headers['X-User-ID'] = this.userId;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError<ApiError>) => {
        console.error('[API Error]', error.response?.data || error.message);
        return Promise.reject(error);
      }
    );
  }

  setUserId(userId: string) {
    this.userId = userId;
    storage.set('userId', userId);
  }

  getUserId(): string | null {
    if (!this.userId) {
      this.userId = storage.getString('userId') || null;
    }
    return this.userId;
  }

  async ensureUserId(): Promise<string> {
    let id = this.getUserId();
    if (!id) {
      id = `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      this.setUserId(id);
    }
    return id;
  }

  async getFeed(offset = 0, limit = 10): Promise<FeedResponse> {
    const userId = await this.ensureUserId();
    const response = await this.client.get<FeedResponse>('/api/v1/feed', {
      params: { userId, offset, limit },
    });
    return response.data;
  }

  async submitProgress(data: SubmitProgressRequest): Promise<void> {
    await this.client.post('/api/v1/progress', data);
  }

  async getUserProgress(userId: string): Promise<UserProgress[]> {
    const response = await this.client.get<UserProgress[]>(`/api/v1/progress/${userId}`);
    return response.data;
  }
}

export const api = new ApiClient();