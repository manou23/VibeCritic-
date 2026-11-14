import { t as esmExternalRequirePlugin } from "./shared/constructors-g-97DRkR.mjs";
import { _ as BindingReplacePluginConfig } from "./shared/binding-BHW9n9O-.mjs";
import { L as BuiltinPlugin } from "./shared/define-config-QuM53xoi.mjs";
/**
 * Replaces targeted strings in files while bundling.
 *
 * @example
 * **Basic usage**
 * ```js
 * replacePlugin({
 *   'process.env.NODE_ENV': JSON.stringify('production'),
 *    __buildVersion: 15
 * })
 * ```
 * @example
 * **With options**
 * ```js
 * replacePlugin({
 *   'process.env.NODE_ENV': JSON.stringify('production'),
 *   __buildVersion: 15
 * }, {
 *   preventAssignment: false,
 * })
 * ```
 *
 * @see https://rolldown.rs/builtin-plugins/replace
 * @category Builtin Plugins
 */
export declare function replacePlugin(values?: BindingReplacePluginConfig["values"], options?: Omit<BindingReplacePluginConfig, "values">): BuiltinPlugin;
export { esmExternalRequirePlugin };