import { i as __toESM } from "./rolldown-runtime-BVN1G_yT.mjs";
import { n as BuiltinPlugin } from "./normalize-string-or-regex-zJCHXVJD.mjs";
import { C as LOG_LEVEL_WARN, T as VERSION, _ as getParallelPluginInfo, a as measureIfFunction, b as LOG_LEVEL_DEBUG, c as PluginContextData, d as transformRenderedChunk, g as MinimalPluginContextImpl, i as measureHookCost, l as transformModuleInfo, o as pluginTimingsRecorderFor, p as transformAssetSource, r as OUTPUT_OPTIONS_OWNER, t as bindingifyInputOptions, v as normalizeHook, w as logLevelPriority, y as normalizeLog } from "./bindingify-input-options-Fc_YrR7y.mjs";
import { a as logInputHookInOutputPlugin, n as error, s as logMissingCodeSplittingGroupDebugName } from "./logs-BphcrOCD.mjs";
import { a as unimplemented, t as arraify } from "./misc-BaVlOYH0.mjs";
import { t as require_binding } from "./binding-CDFeuY-7.mjs";
import { Worker } from "node:worker_threads";
import path from "node:path";
import os from "node:os";
// src/log/logger.ts
function getLogger(plugins, onLog, logLevel, watchMode) {
	const minimalPriority = logLevelPriority[logLevel];
	const logger = (level, log, skipped = /* @__PURE__ */ new Set()) => {
		if (logLevelPriority[level] < minimalPriority) return;
		for (const plugin of getSortedPlugins("onLog", plugins)) {
			if (skipped.has(plugin)) continue;
			const { onLog: pluginOnLog } = plugin;
			if (pluginOnLog) {
				const getLogHandler = (level) => {
					if (logLevelPriority[level] < minimalPriority) return () => {};
					return (log) => logger(level, normalizeLog(log), new Set(skipped).add(plugin));
				};
				if (("handler" in pluginOnLog ? pluginOnLog.handler : pluginOnLog).call({
					debug: getLogHandler("debug"),
					error: (log) => error(normalizeLog(log)),
					info: getLogHandler("info"),
					meta: {
						rollupVersion: "4.23.0",
						rolldownVersion: VERSION,
						watchMode
					},
					warn: getLogHandler("warn"),
					pluginName: plugin.name || "unknown"
				}, level, log) === false) return;
			}
		}
		onLog(level, log);
	};
	return logger;
}
const getOnLog = (config, logLevel, printLog = defaultPrintLog) => {
	const { onwarn, onLog } = config;
	const defaultOnLog = getDefaultOnLog(printLog, onwarn);
	if (onLog) {
		const minimalPriority = logLevelPriority[logLevel];
		return (level, log) => onLog(level, addLogToString(log), (level, handledLog) => {
			if (level === "error") return error(normalizeLog(handledLog));
			if (logLevelPriority[level] >= minimalPriority) defaultOnLog(level, normalizeLog(handledLog));
		});
	}
	return defaultOnLog;
};
const getDefaultOnLog = (printLog, onwarn) => onwarn ? (level, log) => {
	if (level === "warn") onwarn(addLogToString(log), (warning) => printLog(LOG_LEVEL_WARN, normalizeLog(warning)));
	else printLog(level, log);
} : printLog;
const addLogToString = (log) => {
	Object.defineProperty(log, "toString", {
		value: () => getExtendedLogMessage(log),
		writable: true
	});
	return log;
};
const defaultPrintLog = (level, log) => {
	const message = getExtendedLogMessage(log);
	switch (level) {
		case LOG_LEVEL_WARN: return console.warn(message);
		case LOG_LEVEL_DEBUG: return console.debug(message);
		default: return console.info(message);
	}
};
const getExtendedLogMessage = (log) => {
	let prefix = "";
	if (log.plugin) prefix += `(${log.plugin} plugin) `;
	if (log.loc) prefix += `${relativeId(log.loc.file)} (${log.loc.line}:${log.loc.column}) `;
	return prefix + log.message;
};
function relativeId(id) {
	if (!path.isAbsolute(id)) return id;
	return path.relative(path.resolve(), id);
}
// src/constants/plugin.ts
const ENUMERATED_INPUT_PLUGIN_HOOK_NAMES = [
	"options",
	"buildStart",
	"resolveId",
	"load",
	"transform",
	"moduleParsed",
	"buildEnd",
	"onLog",
	"resolveDynamicImport",
	"closeBundle",
	"closeWatcher",
	"watchChange"
];
const ENUMERATED_OUTPUT_PLUGIN_HOOK_NAMES = [
	"augmentChunkHash",
	"outputOptions",
	"renderChunk",
	"renderStart",
	"renderError",
	"writeBundle",
	"generateBundle",
	"resolveFileUrl"
];
const ENUMERATED_PLUGIN_HOOK_NAMES = [
	...ENUMERATED_INPUT_PLUGIN_HOOK_NAMES,
	...ENUMERATED_OUTPUT_PLUGIN_HOOK_NAMES,
	"footer",
	"banner",
	"intro",
	"outro"
];
ENUMERATED_PLUGIN_HOOK_NAMES[0], ENUMERATED_PLUGIN_HOOK_NAMES[0], ENUMERATED_PLUGIN_HOOK_NAMES[1], ENUMERATED_PLUGIN_HOOK_NAMES[1], ENUMERATED_PLUGIN_HOOK_NAMES[2], ENUMERATED_PLUGIN_HOOK_NAMES[2], ENUMERATED_PLUGIN_HOOK_NAMES[3], ENUMERATED_PLUGIN_HOOK_NAMES[3], ENUMERATED_PLUGIN_HOOK_NAMES[4], ENUMERATED_PLUGIN_HOOK_NAMES[4], ENUMERATED_PLUGIN_HOOK_NAMES[5], ENUMERATED_PLUGIN_HOOK_NAMES[5], ENUMERATED_PLUGIN_HOOK_NAMES[6], ENUMERATED_PLUGIN_HOOK_NAMES[6], ENUMERATED_PLUGIN_HOOK_NAMES[7], ENUMERATED_PLUGIN_HOOK_NAMES[7], ENUMERATED_PLUGIN_HOOK_NAMES[8], ENUMERATED_PLUGIN_HOOK_NAMES[8], ENUMERATED_PLUGIN_HOOK_NAMES[9], ENUMERATED_PLUGIN_HOOK_NAMES[9], ENUMERATED_PLUGIN_HOOK_NAMES[10], ENUMERATED_PLUGIN_HOOK_NAMES[10], ENUMERATED_PLUGIN_HOOK_NAMES[11], ENUMERATED_PLUGIN_HOOK_NAMES[11], ENUMERATED_PLUGIN_HOOK_NAMES[12], ENUMERATED_PLUGIN_HOOK_NAMES[12], ENUMERATED_PLUGIN_HOOK_NAMES[13], ENUMERATED_PLUGIN_HOOK_NAMES[13], ENUMERATED_PLUGIN_HOOK_NAMES[14], ENUMERATED_PLUGIN_HOOK_NAMES[14], ENUMERATED_PLUGIN_HOOK_NAMES[15], ENUMERATED_PLUGIN_HOOK_NAMES[15], ENUMERATED_PLUGIN_HOOK_NAMES[16], ENUMERATED_PLUGIN_HOOK_NAMES[16], ENUMERATED_PLUGIN_HOOK_NAMES[17], ENUMERATED_PLUGIN_HOOK_NAMES[17], ENUMERATED_PLUGIN_HOOK_NAMES[18], ENUMERATED_PLUGIN_HOOK_NAMES[18], ENUMERATED_PLUGIN_HOOK_NAMES[19], ENUMERATED_PLUGIN_HOOK_NAMES[19], ENUMERATED_PLUGIN_HOOK_NAMES[20], ENUMERATED_PLUGIN_HOOK_NAMES[20], ENUMERATED_PLUGIN_HOOK_NAMES[21], ENUMERATED_PLUGIN_HOOK_NAMES[21], ENUMERATED_PLUGIN_HOOK_NAMES[22], ENUMERATED_PLUGIN_HOOK_NAMES[22], ENUMERATED_PLUGIN_HOOK_NAMES[23], ENUMERATED_PLUGIN_HOOK_NAMES[23];
// src/plugin/internal-hooks.ts
/**
* Names of the hidden hooks, alongside {@linkcode InternalFunctionPluginHooks}.
* Kept separate from `ENUMERATED_INPUT_PLUGIN_HOOK_NAMES` so the names stay out
* of the published `.d.ts` (that list's type is reachable from public types).
*/
const INTERNAL_PLUGIN_HOOK_NAMES = ["hotUpdate"];
// src/utils/async-flatten.ts
async function asyncFlatten(array) {
	do
		array = (await Promise.all(array)).flat(1e400);
	while (array.some((v) => v?.then));
	return array;
}
// src/utils/normalize-plugin-option.ts
const normalizePluginOption = async (plugins) => (await asyncFlatten([plugins])).filter(Boolean);
function checkOutputPluginOption(plugins, onLog) {
	for (const plugin of plugins) for (const hook of [...ENUMERATED_INPUT_PLUGIN_HOOK_NAMES, ...INTERNAL_PLUGIN_HOOK_NAMES]) if (hook in plugin) {
		delete plugin[hook];
		onLog(LOG_LEVEL_WARN, logInputHookInOutputPlugin(plugin.name, hook));
	}
	return plugins;
}
function normalizePlugins(plugins, anonymousPrefix) {
	for (const [index, plugin] of plugins.entries()) {
		if (getParallelPluginInfo(plugin)) continue;
		if (plugin instanceof BuiltinPlugin) continue;
		const objectPlugin = plugin;
		if (!objectPlugin.name) objectPlugin.name = `${anonymousPrefix}${index + 1}`;
	}
	return plugins;
}
const ANONYMOUS_PLUGIN_PREFIX = "at position ";
const ANONYMOUS_OUTPUT_PLUGIN_PREFIX = "at output position ";
// src/plugin/plugin-driver.ts
var PluginDriver = class {
	static async callOptionsHook(inputOptions, watchMode = false) {
		const logLevel = inputOptions.logLevel || "info";
		const plugins = getSortedPlugins("options", getObjectPlugins(await normalizePluginOption(inputOptions.plugins)));
		const logger = getLogger(plugins, getOnLog(inputOptions, logLevel), logLevel, watchMode);
		for (const plugin of plugins) {
			const name = plugin.name || "unknown";
			const options = plugin.options;
			if (options) {
				const { handler } = normalizeHook(options);
				const result = await handler.call(new MinimalPluginContextImpl(logger, logLevel, name, watchMode, "onLog"), inputOptions);
				if (result) inputOptions = result;
			}
		}
		return inputOptions;
	}
	static callOutputOptionsHook(rawPlugins, outputOptions, onLog, logLevel, watchMode) {
		const sortedPlugins = getSortedPlugins("outputOptions", getObjectPlugins(rawPlugins));
		for (const plugin of sortedPlugins) {
			const name = plugin.name || "unknown";
			const options = plugin.outputOptions;
			if (options) {
				const { handler } = normalizeHook(options);
				const result = handler.call(new MinimalPluginContextImpl(onLog, logLevel, name, watchMode), outputOptions);
				if (result) outputOptions = result;
			}
		}
		return outputOptions;
	}
};
function getObjectPlugins(plugins) {
	return plugins.filter((plugin) => {
		if (!plugin) return;
		if (getParallelPluginInfo(plugin)) return;
		if (plugin instanceof BuiltinPlugin) return;
		return plugin;
	});
}
function getSortedPlugins(hookName, plugins) {
	const pre = [];
	const normal = [];
	const post = [];
	for (const plugin of plugins) {
		const hook = plugin[hookName];
		if (hook) {
			if (typeof hook === "object") {
				if (hook.order === "pre") {
					pre.push(plugin);
					continue;
				}
				if (hook.order === "post") {
					post.push(plugin);
					continue;
				}
			}
			normal.push(plugin);
		}
	}
	return [
		...pre,
		...normal,
		...post
	];
}
// src/types/chunking-context.ts
var ChunkingContextImpl = class {
	context;
	pluginContextData;
	moduleInfoCache = /* @__PURE__ */ new Map();
	constructor(context, pluginContextData) {
		this.context = context;
		this.pluginContextData = pluginContextData;
	}
	clearModuleInfoCache() {
		this.moduleInfoCache = void 0;
	}
	getModuleInfo(moduleId) {
		const cached = this.moduleInfoCache?.get(moduleId);
		if (cached) return cached;
		const bindingInfo = this.context.getModuleInfo(moduleId);
		if (bindingInfo) {
			const option = this.pluginContextData.getModuleOption(moduleId);
			const info = transformModuleInfo(bindingInfo, option);
			Object.defineProperty(info, "moduleSideEffects", {
				get: () => option.moduleSideEffects,
				set: (moduleSideEffects) => {
					option.moduleSideEffects = moduleSideEffects;
					option.invalidate = true;
				}
			});
			this.moduleInfoCache?.set(moduleId, info);
			return info;
		}
		return null;
	}
};
// src/utils/bindingify-output-options.ts
async function getWarn(outputOptions) {
	if (outputOptions.legalComments == null && outputOptions.inlineDynamicImports == null && outputOptions.advancedChunks == null && outputOptions.manualChunks == null) return (message) => console.warn(message);
	const { logger } = await import("./logger-CpvFcLaq.mjs").then((n) => n.n);
	return (message) => logger.warn(message);
}
async function bindingifyOutputOptions(outputOptions, pluginContextData, onLog, timings) {
	const { dir, charset, format, exports, hashCharacters, sourcemap, sourcemapBaseUrl, sourcemapDebugIds, sourcemapFileNames, sourcemapExcludeSources, sourcemapIgnoreList, sourcemapPathTransform, name, assetFileNames, entryFileNames, chunkFileNames, banner, footer, postBanner, postFooter, intro, outro, esModule, globals, paths, generatedCode, file, sanitizeFileName, preserveModules, virtualDirname, legalComments, comments, preserveModulesRoot, manualChunks, topLevelVar, cleanDir, strictExecutionOrder } = outputOptions;
	const warn = await getWarn(outputOptions);
	if (legalComments != null) warn("`legalComments` option is deprecated, please use `comments.legal` instead.");
	const { inlineDynamicImports, advancedChunks } = bindingifyCodeSplitting(outputOptions.codeSplitting, outputOptions.inlineDynamicImports, outputOptions.advancedChunks, manualChunks, pluginContextData, onLog, timings, warn);
	return {
		dir,
		charset,
		file: file == null ? void 0 : file,
		format: bindingifyFormat(format),
		exports,
		hashCharacters,
		sourcemap: bindingifySourcemap(sourcemap),
		sourcemapBaseUrl,
		sourcemapDebugIds,
		sourcemapFileNames: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "sourcemapFileNames", sourcemapFileNames),
		sourcemapExcludeSources,
		sourcemapIgnoreList: batchSourcemapIgnoreList(measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "sourcemapIgnoreList", sourcemapIgnoreList ?? /node_modules/)),
		sourcemapPathTransform: batchSourcemapPathTransform(measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "sourcemapPathTransform", sourcemapPathTransform)),
		banner: bindingifyAddon(banner, "banner", timings),
		footer: bindingifyAddon(footer, "footer", timings),
		postBanner: bindingifyAddon(postBanner, "postBanner", timings),
		postFooter: bindingifyAddon(postFooter, "postFooter", timings),
		intro: bindingifyAddon(intro, "intro", timings),
		outro: bindingifyAddon(outro, "outro", timings),
		extend: outputOptions.extend,
		globals: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "globals", globals),
		paths: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "paths", paths),
		generatedCode,
		esModule,
		name,
		assetFileNames: bindingifyAssetFilenames(assetFileNames),
		entryFileNames: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "entryFileNames", entryFileNames),
		chunkFileNames: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "chunkFileNames", chunkFileNames),
		plugins: [],
		minify: outputOptions.minify,
		externalLiveBindings: outputOptions.externalLiveBindings,
		inlineDynamicImports,
		dynamicImportInCjs: outputOptions.dynamicImportInCjs,
		manualCodeSplitting: advancedChunks,
		polyfillRequire: outputOptions.polyfillRequire,
		sanitizeFileName,
		preserveModules,
		virtualDirname,
		legalComments,
		comments: bindingifyComments(comments),
		preserveModulesRoot,
		topLevelVar,
		minifyInternalExports: outputOptions.minifyInternalExports,
		cleanDir,
		strictExecutionOrder,
		strict: outputOptions.strict
	};
}
function bindingifyAddon(configAddon, name, timings) {
	if (configAddon == null || configAddon === "") return;
	if (typeof configAddon === "function") {
		const measured = measureHookCost(timings, OUTPUT_OPTIONS_OWNER, name, configAddon);
		return async (chunk) => measured(transformRenderedChunk(chunk));
	}
	return configAddon;
}
function bindingifyFormat(format) {
	switch (format) {
		case void 0:
		case "es":
		case "esm":
		case "module": return "es";
		case "cjs":
		case "commonjs": return "cjs";
		case "iife": return "iife";
		case "umd": return "umd";
		default: unimplemented(`output.format: ${format}`);
	}
}
function bindingifySourcemap(sourcemap) {
	switch (sourcemap) {
		case true: return "file";
		case "inline": return "inline";
		case false:
		case void 0: return;
		case "hidden": return "hidden";
		default: throw new Error(`unknown sourcemap: ${sourcemap}`);
	}
}
function bindingifyAssetFilenames(assetFileNames) {
	if (typeof assetFileNames === "function") return (asset) => {
		return assetFileNames({
			name: asset.name,
			names: asset.names,
			originalFileName: asset.originalFileName,
			originalFileNames: asset.originalFileNames,
			source: transformAssetSource(asset.source),
			type: "asset"
		});
	};
	return assetFileNames;
}
function bindingifyComments(comments) {
	if (comments == null) return;
	if (typeof comments === "boolean") return comments;
	return comments;
}
function bindingifyCodeSplitting(codeSplitting, inlineDynamicImportsOption, advancedChunks, manualChunks, pluginContextData, onLog, timings, warn) {
	let inlineDynamicImports;
	let effectiveChunksOption;
	let migratedManualChunksGroup;
	let chunksOptionName = "codeSplitting";
	if (codeSplitting === false) {
		if (inlineDynamicImportsOption != null) warn("`inlineDynamicImports` option is ignored because `codeSplitting: false` is set.");
		if (manualChunks != null) throw new Error("Invalid configuration: \"output.manualChunks\" cannot be used when \"output.codeSplitting\" is set to false.");
		if (advancedChunks != null) warn("`advancedChunks` option is ignored because `codeSplitting` is set to `false`.");
		return {
			inlineDynamicImports: true,
			advancedChunks: void 0
		};
	} else if (codeSplitting === true) {
		if (inlineDynamicImportsOption != null) warn("`inlineDynamicImports` option is ignored because `codeSplitting: true` is set.");
	} else if (codeSplitting == null) {
		if (inlineDynamicImportsOption != null) {
			warn("`inlineDynamicImports` option is deprecated, please use `codeSplitting: false` instead.");
			inlineDynamicImports = inlineDynamicImportsOption;
		}
	} else {
		effectiveChunksOption = codeSplitting;
		chunksOptionName = "codeSplitting";
		if (inlineDynamicImportsOption != null) warn("`inlineDynamicImports` option is ignored because the `codeSplitting` option is specified.");
	}
	if (inlineDynamicImports === true && manualChunks != null) throw new Error("Invalid value \"true\" for option \"output.inlineDynamicImports\" - this option is not supported for \"output.manualChunks\".");
	if (effectiveChunksOption == null) {
		if (advancedChunks != null) {
			warn("`advancedChunks` option is deprecated, please use `codeSplitting` instead.");
			effectiveChunksOption = advancedChunks;
			chunksOptionName = "advancedChunks";
		}
	} else if (advancedChunks != null) warn("`advancedChunks` option is ignored because the `codeSplitting` option is specified.");
	if (manualChunks != null && effectiveChunksOption != null) warn("`manualChunks` option is ignored because the `codeSplitting` option is specified.");
	else if (manualChunks != null) {
		chunksOptionName = "manualChunks";
		migratedManualChunksGroup = { name(moduleId, ctx) {
			return manualChunks(moduleId, { getModuleInfo: (id) => ctx.getModuleInfo(id) });
		} };
		effectiveChunksOption = { groups: [migratedManualChunksGroup] };
	}
	if (inlineDynamicImports === true && effectiveChunksOption != null) {
		warn("`advancedChunks` option is ignored because `inlineDynamicImports: true` disables code splitting.");
		effectiveChunksOption = void 0;
	}
	let advancedChunksResult;
	if (effectiveChunksOption != null) {
		const { groups, experimentalInlineCommonChunks, ...restOptions } = effectiveChunksOption;
		let chunkingContext;
		const getChunkingContext = (bindingContext) => chunkingContext ??= new ChunkingContextImpl(bindingContext, pluginContextData);
		advancedChunksResult = {
			...restOptions,
			experimentalInlineCommonChunks: experimentalInlineCommonChunks == null ? void 0 : {
				maxSize: experimentalInlineCommonChunks.maxSize,
				exclude: experimentalInlineCommonChunks.exclude == null ? void 0 : arraify(experimentalInlineCommonChunks.exclude).map((matcher) => typeof matcher === "function" ? batchTest(measureHookCost(timings, OUTPUT_OPTIONS_OWNER, "codeSplitting.experimentalInlineCommonChunks.exclude", matcher), "output.codeSplitting.experimentalInlineCommonChunks.exclude") : matcher)
			},
			internalInvalidateModuleInfoCache: () => {
				chunkingContext?.clearModuleInfoCache();
				chunkingContext = void 0;
			},
			groups: groups?.map((group, index) => {
				const { debugName, name, test, ...restGroup } = group;
				const timingKey = group === migratedManualChunksGroup ? manualChunks ?? group : group;
				const timingOwner = timings === void 0 ? OUTPUT_OPTIONS_OWNER : {
					...OUTPUT_OPTIONS_OWNER,
					key: timingKey
				};
				const groupName = `${chunksOptionName} groups[${index}]`;
				let testTimingName = `${groupName}.test`;
				let nameTimingName = `${groupName}.name`;
				if (timings !== void 0) {
					if (chunksOptionName === "manualChunks") nameTimingName = "manualChunks";
					else {
						const label = debugName ?? (typeof name === "string" ? name : void 0);
						if (label === void 0) {
							if (typeof name === "function" && !timings.warnedMissingGroupLabels.has(timingKey)) {
								timings.warnedMissingGroupLabels.add(timingKey);
								onLog(LOG_LEVEL_WARN, logMissingCodeSplittingGroupDebugName(`output.${chunksOptionName}.groups[${index}]`));
							}
						} else {
							const labelSuffix = ` ${JSON.stringify(label)}`;
							testTimingName = `${groupName}.test${labelSuffix}`;
							nameTimingName = `${groupName}.name${labelSuffix}`;
						}
					}
				}
				return {
					...restGroup,
					test: typeof test === "function" ? batchTest(measureHookCost(timings, timingOwner, testTimingName, test)) : test,
					name: typeof name === "function" ? batchName(measureHookCost(timings, timingOwner, nameTimingName, name), getChunkingContext) : name
				};
			})
		};
	}
	return {
		inlineDynamicImports,
		advancedChunks: advancedChunksResult
	};
}
/**
* Wraps a per-id `test` in the batched shim that the binding expects.
*
* The loop runs in JS so that a group makes one napi crossing, not one per module.
*
* The result is a `Uint8Array`, which crosses as a buffer instead of one tagged value per id.
*/
function batchTest(test, optionName = "output.codeSplitting.groups[].test") {
	return (ids) => {
		const results = new Uint8Array(ids.length);
		for (let index = 0; index < ids.length; index++) {
			const result = test(ids[index]);
			if (result != null && typeof result !== "boolean") throw new TypeError(`\`${optionName}\` returned ${typeof result} for module "${ids[index]}", but expected a boolean, null or undefined.`);
			results[index] = result === true ? 1 : 0;
		}
		return results;
	};
}
/**
* This is the `name` equivalent of {@linkcode batchTest}. All groups in a chunking pass share
* a context so repeated module queries reuse their JavaScript values.
*/
function batchName(name, getChunkingContext) {
	return (ids, bindingContext) => {
		const context = getChunkingContext(bindingContext);
		const results = [];
		for (let index = 0; index < ids.length; index++) {
			const result = name(ids[index], context);
			if (result != null && typeof result !== "string") throw new TypeError(`\`output.codeSplitting.groups[].name\` returned ${typeof result} for module "${ids[index]}", but expected a string, null or undefined.`);
			results.push(result);
		}
		return results;
	};
}
/**
* Wraps a per-source `sourcemapIgnoreList` in the batched shim that the binding expects.
*
* The loop runs in JS so that a sourcemap makes one napi crossing, not one per source. The old
* Rust loop also awaited each call before it started the next.
*
* The result is a `Uint8Array`, which crosses as a buffer instead of one tagged value per source.
*
* A boolean, string or regular expression passes through. Rust reads those without a call.
*/
function batchSourcemapIgnoreList(ignoreList) {
	if (typeof ignoreList !== "function") return ignoreList;
	return (sources, sourcemapPath) => {
		const results = new Uint8Array(sources.length);
		for (let index = 0; index < sources.length; index++) {
			const result = ignoreList(sources[index], sourcemapPath);
			if (typeof result !== "boolean") throw new TypeError(`\`output.sourcemapIgnoreList\` returned ${typeof result} for source "${sources[index]}", but expected a boolean.`);
			results[index] = result ? 1 : 0;
		}
		return results;
	};
}
/**
* The `sourcemapPathTransform` counterpart of {@linkcode batchSourcemapIgnoreList}.
*
* A path cannot be reduced to a byte, so this batch is still an array of strings. napi reports the
* type of the array, not of the bad element, so the check runs here.
*/
function batchSourcemapPathTransform(pathTransform) {
	if (typeof pathTransform !== "function") return pathTransform;
	return (sources, sourcemapPath) => {
		const results = [];
		for (let index = 0; index < sources.length; index++) {
			const result = pathTransform(sources[index], sourcemapPath);
			if (typeof result !== "string") throw new TypeError(`\`output.sourcemapPathTransform\` returned ${typeof result} for source "${sources[index]}", but expected a string.`);
			results.push(result);
		}
		return results;
	};
}
// src/utils/initialize-parallel-plugins.ts
var import_binding = /* @__PURE__ */ __toESM(require_binding(), 1);
async function initializeParallelPlugins(plugins) {
	const pluginInfos = [];
	for (const [index, plugin] of plugins.entries()) {
		const parallel = getParallelPluginInfo(plugin);
		if (parallel) {
			const { fileUrl, options } = parallel;
			pluginInfos.push({
				index,
				fileUrl,
				options
			});
		}
	}
	if (pluginInfos.length <= 0) return;
	const count = availableParallelism();
	const parallelJsPluginRegistry = new import_binding.ParallelJsPluginRegistry(count);
	const registryId = parallelJsPluginRegistry.id;
	const workers = await initializeWorkers(registryId, count, pluginInfos);
	const stopWorkers = async () => {
		await Promise.all(workers.map((worker) => worker.terminate()));
	};
	return {
		registry: parallelJsPluginRegistry,
		stopWorkers
	};
}
function initializeWorkers(registryId, count, pluginInfos) {
	return Promise.all(Array.from({ length: count }, (_, i) => initializeWorker(registryId, pluginInfos, i)));
}
async function initializeWorker(registryId, pluginInfos, threadNumber) {
	const urlString = import.meta.resolve("#parallel-plugin-worker");
	const workerData = {
		registryId,
		pluginInfos,
		threadNumber
	};
	let worker;
	try {
		worker = new Worker(new URL(urlString), { workerData });
		worker.unref();
		await new Promise((resolve, reject) => {
			worker.once("message", async (message) => {
				if (message.type === "error") reject(message.error);
				else resolve();
			});
		});
		return worker;
	} catch (e) {
		worker?.terminate();
		throw e;
	}
}
const availableParallelism = () => {
	let availableParallelism = 1;
	try {
		availableParallelism = os.availableParallelism();
	} catch {
		const cpus = os.cpus();
		if (Array.isArray(cpus) && cpus.length > 0) availableParallelism = cpus.length;
	}
	return Math.min(availableParallelism, 8);
};
// src/utils/create-bundler-option.ts
async function createBundlerOptions(inputOptions, outputOptions, watchMode, measureTimings = false) {
	const inputPlugins = await normalizePluginOption(inputOptions.plugins);
	const outputPlugins = await normalizePluginOption(outputOptions.plugins);
	const logLevel = inputOptions.logLevel || "info";
	const onLog = getLogger(getObjectPlugins(inputPlugins), getOnLog(inputOptions, logLevel), logLevel, watchMode);
	outputOptions = PluginDriver.callOutputOptionsHook([...inputPlugins, ...outputPlugins], outputOptions, onLog, logLevel, watchMode);
	const hookOutputPlugins = await normalizePluginOption(outputOptions.plugins);
	const normalizedInputPlugins = normalizePlugins(inputPlugins, ANONYMOUS_PLUGIN_PREFIX);
	const normalizedOutputPlugins = normalizePlugins(hookOutputPlugins, ANONYMOUS_OUTPUT_PLUGIN_PREFIX);
	let plugins = [...normalizedInputPlugins, ...checkOutputPluginOption(normalizedOutputPlugins, onLog)];
	const timings = measureTimings && (inputOptions.checks?.bundlerTimings ?? inputOptions.checks?.pluginTimings ?? true) ? pluginTimingsRecorderFor(inputOptions) : void 0;
	if (timings) outputOptions = {
		...outputOptions,
		assetFileNames: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "assetFileNames", outputOptions.assetFileNames),
		sanitizeFileName: measureIfFunction(timings, OUTPUT_OPTIONS_OWNER, "sanitizeFileName", outputOptions.sanitizeFileName)
	};
	const parallelPluginInitResult = await initializeParallelPlugins(plugins);
	if (inputOptions.experimental?.strictExecutionOrder !== void 0) console.warn("`experimental.strictExecutionOrder` has been stabilized and moved to `output.strictExecutionOrder`. Please update your configuration.");
	try {
		const pluginContextData = new PluginContextData(onLog, outputOptions, normalizedInputPlugins, normalizedOutputPlugins);
		pluginContextData.importAttributes = inputOptions.experimental?.importAttributes ?? false;
		return {
			bundlerOptions: {
				inputOptions: bindingifyInputOptions(plugins, inputOptions, outputOptions, pluginContextData, normalizedOutputPlugins, onLog, logLevel, watchMode, timings),
				outputOptions: await bindingifyOutputOptions(outputOptions, pluginContextData, onLog, timings),
				parallelPluginsRegistry: parallelPluginInitResult?.registry
			},
			inputOptions,
			onLog,
			stopWorkers: parallelPluginInitResult?.stopWorkers
		};
	} catch (e) {
		await parallelPluginInitResult?.stopWorkers();
		throw e;
	}
}
export { PluginDriver as n, createBundlerOptions as t };
