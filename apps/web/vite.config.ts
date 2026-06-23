import react from '@vitejs/plugin-react';

export default {
  plugins: [react()] as unknown[],
  server: {
    port: 5173
  }
};
