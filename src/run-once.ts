import { runCycle } from "./cycle";

// Executa um único ciclo e encerra — útil para testar localmente (npm run cycle)
runCycle()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Ciclo falhou:", err);
    process.exit(1);
  });
