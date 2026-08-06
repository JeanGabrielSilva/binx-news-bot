import { createHmac } from "crypto";

/** Integração com a API de agente da BingX (somente leitura). */

const BASE = "https://open-api.bingx.com";
/** Meta de volume negociado do programa de afiliados (USD). */
export const GOAL_USD = 1_000_000;
/** Início da contagem da meta (criação do canal). */
const GOAL_START_UTC = Date.UTC(2026, 7, 1); // 2026-08-01

export interface InvitedUser {
  uid: string;
  registerTime: number;
  kycResult: string;
  deposit: boolean;
  trade: boolean;
  directInvitation: boolean;
}

interface CommissionRow {
  uid: number;
  commissionTime: number;
  tradingVolume: string;
  commissionVolume: string;
}

export interface Conversions {
  ok: boolean;
  reason?: string;
  invitedTotal: number;
  deposited: number;
  traded: number;
  recent: InvitedUser[];
  volumeTotal: number;
  commissionTotal: number;
  volume30d: number;
  commission30d: number;
  goalUsd: number;
}

const EMPTY: Omit<Conversions, "ok" | "reason"> = {
  invitedTotal: 0,
  deposited: 0,
  traded: 0,
  recent: [],
  volumeTotal: 0,
  commissionTotal: 0,
  volume30d: 0,
  commission30d: 0,
  goalUsd: GOAL_USD,
};

// Cache em memória (15 min) — evita martelar a API a cada carregamento do painel
const memo = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const data = await fn();
  memo.set(key, { at: Date.now(), data });
  return data;
}

function fmtDay(d: Date): string {
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}

/** GET assinado (HMAC SHA256 dos parâmetros em ordem ASC, hex minúsculo). */
async function bingxGet<T>(path: string, params: Record<string, string | number>): Promise<T | null> {
  const apiKey = process.env.BINGX_API_KEY;
  const secret = process.env.BINGX_SECRET_KEY;
  if (!apiKey || !secret) throw new Error("nao_configurado");

  const all: Record<string, string | number> = { ...params, timestamp: Date.now() };
  const qs = Object.keys(all)
    .sort()
    .map((k) => `${k}=${all[k]}`)
    .join("&");
  const signature = createHmac("sha256", secret).update(qs).digest("hex");

  const res = await fetch(`${BASE}${path}?${qs}&signature=${signature}`, {
    headers: { "X-BX-APIKEY": apiKey, "X-SOURCE-KEY": "BX-AI-SKILL" },
    cache: "no-store",
  });
  const json = (await res.json()) as { code: number; msg?: string; data?: T };
  if (json.code !== 0) throw new Error(`BingX ${json.code}: ${json.msg ?? "erro"}`);
  return json.data ?? null;
}

/** Convidados + volume/comissão acumulados desde o início da meta e nos últimos 30 dias. */
export async function bingxConversions(): Promise<Conversions> {
  try {
    return await cached("conversions", 15 * 60 * 1000, async () => {
      const inv = await bingxGet<{ list?: InvitedUser[]; total?: number }>(
        "/openApi/agent/v1/account/inviteAccountList",
        { pageIndex: 1, pageSize: 100 },
      );
      const list = inv?.list ?? [];

      // Comissões em janelas de 30 dias (limite da API) desde o início da meta
      let volumeTotal = 0;
      let commissionTotal = 0;
      let volume30d = 0;
      let commission30d = 0;
      const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const today = new Date();

      for (
        let windowStart = new Date(GOAL_START_UTC);
        windowStart <= today;
        windowStart = new Date(windowStart.getTime() + 30 * 24 * 60 * 60 * 1000)
      ) {
        const windowEnd = new Date(Math.min(windowStart.getTime() + 29 * 24 * 60 * 60 * 1000, today.getTime()));
        for (let page = 1; page <= 10; page++) {
          const data = await bingxGet<{ list?: CommissionRow[] }>(
            "/openApi/agent/v2/reward/commissionDataList",
            { startTime: fmtDay(windowStart), endTime: fmtDay(windowEnd), pageIndex: page, pageSize: 100 },
          );
          const rows = data?.list ?? [];
          for (const row of rows) {
            const volume = Number(row.tradingVolume || 0);
            const commission = Number(row.commissionVolume || 0);
            volumeTotal += volume;
            commissionTotal += commission;
            if (row.commissionTime >= cutoff30) {
              volume30d += volume;
              commission30d += commission;
            }
          }
          if (rows.length < 100) break;
        }
      }

      return {
        ok: true,
        invitedTotal: inv?.total ?? list.length,
        deposited: list.filter((u) => u.deposit).length,
        traded: list.filter((u) => u.trade).length,
        recent: list.slice(0, 20),
        volumeTotal,
        commissionTotal,
        volume30d,
        commission30d,
        goalUsd: GOAL_USD,
      };
    });
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "erro desconhecido",
      ...EMPTY,
    };
  }
}
