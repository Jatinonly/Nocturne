/** Typed access to Vite env vars. Add new ones to `.env.example` too. */
export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  /** Mock services are used until a backend URL is configured. */
  get useMockApi() {
    return this.apiBaseUrl === ''
  },
}
