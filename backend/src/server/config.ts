export interface ServerConfig {
  env: string;
  isProduction: boolean;
  port: number;
}

export function getServerConfig(): ServerConfig {
  const env = process.env.NODE_ENV || "development";
  const port = parseInt(process.env.PORT || "3001", 10);

  return {
    env,
    isProduction: env === "production",
    port,
  };
}
