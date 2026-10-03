declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NADA_DISABLE_GUIDE_LINES?: "true" | "false"
      NADA_REPORTER?: "default" | "verbose"
    }
  }
}

export {}
