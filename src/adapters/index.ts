import type { Adapter } from "chat";
import { wrapTelegramAdapter } from "./telegram/index.js";
import { wrapWeixinAdapter } from "./weixin/index.js";

const ADAPTER_WRAPPERS: Record<string, (adapter: Adapter) => Adapter> = {
  telegram: wrapTelegramAdapter,
  weixin: wrapWeixinAdapter,
};

/** Wrap adapter with platform-specific behavior. Falls through if no wrapper exists. */
export function wrapAdapter(name: string, adapter: Adapter): Adapter {
  return ADAPTER_WRAPPERS[name]?.(adapter) ?? adapter;
}