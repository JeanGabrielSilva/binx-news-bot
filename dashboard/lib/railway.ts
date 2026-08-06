/** Consulta uso e custo do projeto no Railway via API GraphQL pública. */

export interface RailwayCosts {
  ok: boolean;
  reason?: string;
  /** Gasto acumulado no período de cobrança atual (USD). */
  currentUsd: number;
  /** Projeção de gasto até o fim do mês (USD). */
  estimatedUsd: number;
}

/** Tarifas oficiais do Railway (USD): RAM por GB-minuto, CPU por vCPU-minuto, egress por GB. */
const RATE_USD: Record<string, number> = {
  MEMORY_USAGE_GB: 0.000231,
  CPU_USAGE: 0.000463,
  NETWORK_TX_GB: 0.05,
};

const QUERY = `
query costs($projectId: String!) {
  usage(projectId: $projectId, measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB], groupBy: [PROJECT_ID]) {
    measurement
    value
  }
  estimatedUsage(projectId: $projectId, measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB]) {
    measurement
    estimatedValue
  }
}`;

export async function railwayCosts(): Promise<RailwayCosts> {
  const token = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  if (!token || !projectId) {
    return { ok: false, reason: "nao_configurado", currentUsd: 0, estimatedUsd: 0 };
  }

  try {
    const res = await fetch("https://backboard.railway.app/graphql/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: QUERY, variables: { projectId } }),
      next: { revalidate: 1800 },
    });

    const json = (await res.json()) as {
      errors?: { message: string }[];
      data?: {
        usage?: { measurement: string; value: number }[];
        estimatedUsage?: { measurement: string; estimatedValue: number }[];
      };
    };

    if (json.errors?.length) {
      return { ok: false, reason: json.errors[0].message, currentUsd: 0, estimatedUsd: 0 };
    }

    const sum = (rows: { measurement: string; value?: number; estimatedValue?: number }[] | undefined) =>
      (rows ?? []).reduce(
        (total, row) => total + (RATE_USD[row.measurement] ?? 0) * (row.value ?? row.estimatedValue ?? 0),
        0,
      );

    return {
      ok: true,
      currentUsd: sum(json.data?.usage),
      estimatedUsd: sum(json.data?.estimatedUsage),
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "erro de rede",
      currentUsd: 0,
      estimatedUsd: 0,
    };
  }
}
