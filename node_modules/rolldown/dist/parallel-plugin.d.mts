import { E as Plugin, Kt as MaybePromise } from "./shared/define-config-QuM53xoi.mjs";
type ParallelPluginImplementation = Plugin;
type Context = {
  /**
   * Thread number
   */
  threadNumber: number;
};
export declare function defineParallelPluginImplementation<Options>(plugin: (Options: Options, context: Context) => MaybePromise<ParallelPluginImplementation>): (Options: Options, context: Context) => MaybePromise<ParallelPluginImplementation>;
export type { Context, ParallelPluginImplementation };