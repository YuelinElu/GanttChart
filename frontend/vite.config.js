import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const normaliseBase = (value) => {
  if (!value) {
    return undefined;
  }
  const prefixed = value.startsWith("/") ? value : `/${value}`;
  return prefixed.endsWith("/") ? prefixed : `${prefixed}/`;
};

const deriveBaseFromRepo = () => {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    return "/";
  }
  const segments = repository.split("/");
  const repoName = segments[segments.length - 1];
  return repoName ? `/${repoName}/` : "/";
};

const base = normaliseBase(process.env.VITE_PUBLIC_BASE_PATH) || deriveBaseFromRepo();

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
  },
});
