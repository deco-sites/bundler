import { denoPlugins } from "jsr:@luca/esbuild-deno-loader@0.11.1";
import * as esbuild from "npm:esbuild@0.25.4";
import path from "node:path";

// Defines the types and client interface for the js-bundler app

export interface BuildOptions {
  /**
   * @title Files
   * @description A map of file paths to their contents
   */
  files: Record<string, string>;

  /**
   * @title Entrypoint
   * @description The entry file to bundle (e.g. index.ts) (defaults to `index.ts`)
   */
  entrypoint?: string;
}

export interface BuildResult {
  /**
   * @title Base64
   * @description The base64 encoded output of the bundle
   */
  base64: string;
}

/**
 * Resolves the final path of an imported file as if rooted from the project base.
 *
 * @param importPath - The path used in the import statement (e.g., '../b.ts')
 * @param importerPath - The path of the importing file (e.g., './a/main.ts')
 * @returns The absolute import path relative to project root, prefixed with './'
 */
function resolveImportPath(importPath: string, importerPath: string): string {
  // If importer path is empty, resolve directly from project root
  if (!importerPath) {
    const resolvedAbs = path.resolve("./", importPath);
    const relativeToProjectRoot = path.relative("./", resolvedAbs);
    return "./" + relativeToProjectRoot;
  }

  // Get absolute path of importer
  const importerAbs = path.resolve(importerPath);
  // Resolve the imported file as if relative to the importer
  const resolvedAbs = path.resolve(path.dirname(importerAbs), importPath);
  // Get path relative to project root
  const relativeToProjectRoot = path.relative("./", resolvedAbs);
  // Normalize and return
  return "./" + relativeToProjectRoot;
}

const ABS_PATH_REGEXP = /^\.\/|^\//;

/**
 * @name JS_BUNDLER_BUILD
 * @title Build JavaScript/TypeScript code
 * @description Bundles code using esbuild and returns the output as a string
 */
const build = async (
  options: BuildOptions,
): Promise<BuildResult> => {
  const { files, entrypoint } = options;

  // Create a virtual filesystem for esbuild
  const virtualFiles: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    virtualFiles[path.replace(ABS_PATH_REGEXP, "")] = content;
  }

  try {
    const result = await esbuild.build({
      entryPoints: [entrypoint ?? "index.ts"],
      bundle: true,
      write: false,
      format: "esm",
      target: "es2020",
      platform: "browser",
      minify: true,
      sourcemap: false,
      external: ["node:*"],
      plugins: [
        {
          name: "virtual-filesystem",
          setup(build) {
            // Handle virtual files
            build.onResolve({ filter: /.*/ }, (args) => {
              const path = resolveImportPath(args.path, args.importer);

              const noStartingDotSlash = path.replace(ABS_PATH_REGEXP, "");

              if (virtualFiles[noStartingDotSlash]) {
                return Promise.resolve({
                  path: noStartingDotSlash,
                  namespace: "virtual",
                });
              }
              return Promise.resolve(undefined);
            });

            build.onLoad(
              { filter: /.*/, namespace: "virtual" },
              (args) => {

                return Promise.resolve({
                  contents: virtualFiles[args.path],
                  loader: args.path.endsWith(".ts") ? "ts" : "js",
                });
              },
            );
          },
        },
        ...denoPlugins(),
      ],
    });

    if (result.errors && result.errors.length > 0) {
      throw new Error(
        `Build failed: ${result.errors.map((e) => e.text).join("\n")}`,
      );
    }

    // Return the output content as a string
    return { base64: btoa(result.outputFiles[0].text) };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Build failed: ${err.message}`);
  }
};

export default build;
