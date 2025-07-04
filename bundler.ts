import { join } from "jsr:@std/path@1.0.8";


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

const NPMRC_PATH = ".npmrc";

// Default .npmrc content for JSR support
const DEFAULT_NPMRC_CONTENT = `@jsr:registry=https://npm.jsr.io
`;

/**
 * Generate a random build ID
 */
function generateBuildId(): string {
  return crypto.randomUUID().replace(/-/g, '').substring(0, 12);
}

const IS_PROD = Deno.env.get("DENO_DEPLOYMENT_ID") !== undefined;
/**
 * @name JS_BUNDLER_BUILD
 * @title Build JavaScript/TypeScript code
 * @description Bundles code using wrangler and returns the output as a string
 */
const build = async (
  options: BuildOptions,
): Promise<BuildResult> => {
  const { files, entrypoint = "index.ts" } = options;

  // Create build directory structure
  const buildTempDir = IS_PROD ? await Deno.makeTempDir() : Deno.cwd()
  const buildDir = join(buildTempDir, ".build");
  const buildId = generateBuildId();
  const buildPath = join(buildDir, buildId);

  console.log(`Created build directory: ${buildPath}`);

  try {
    // Ensure .build directory exists
    await Deno.mkdir(buildDir, { recursive: true });

    // Create specific build directory
    await Deno.mkdir(buildPath, { recursive: true });

    // Prepare all file operations for parallel execution
    const fileOperations: Promise<void>[] = [];
    const dirsToCreate = new Set<string>();

    // Collect unique directories that need to be created
    for (const filePath of Object.keys(files)) {
      const fullPath = join(buildPath, filePath);
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
      if (dir !== buildPath) {
        dirsToCreate.add(dir);
      }
    }

    // Create all directories in parallel
    const dirOperations = Array.from(dirsToCreate).map(dir =>
      Deno.mkdir(dir, { recursive: true })
    );

    // Wait for all directories to be created
    await Promise.all(dirOperations);

    // Write all files in parallel (including package.json if present)
    for (const [filePath, content] of Object.entries(files)) {
      const fullPath = join(buildPath, filePath);
      console.log(`Writing file: ${fullPath}`);
      fileOperations.push(Deno.writeTextFile(fullPath, content));
    }

    // Add .npmrc file for JSR support (use provided one or default)
    const npmrcContent = files[NPMRC_PATH] || DEFAULT_NPMRC_CONTENT;
    const npmrcPath = join(buildPath, NPMRC_PATH);
    console.log(`Writing .npmrc: ${npmrcPath}`);
    fileOperations.push(Deno.writeTextFile(npmrcPath, npmrcContent));

    // Wait for all file operations to complete
    await Promise.all(fileOperations);

    // Prepare the entrypoint path
    const entrypointPath = join(buildPath, entrypoint);

    console.log(`Entrypoint: ${entrypointPath}`);

    // Check if entrypoint exists and log detailed info
    try {
      const stat = await Deno.stat(entrypointPath);
      console.log(`Entrypoint exists: ${stat.isFile ? 'file' : 'directory'}, size: ${stat.size}`);
    } catch (e) {
      console.error(`Entrypoint stat error:`, e);
      // List files in build directory for debugging
      const files = [];
      for await (const entry of Deno.readDir(buildPath)) {
        files.push(entry.name);
      }
      console.log(`Files in build directory:`, files);
      throw new Error(`Entrypoint file '${entrypoint}' not found in provided files`);
    }

    // Install dependencies before building
    console.log(`Installing dependencies in build directory...`);
    const installCommand = new Deno.Command(Deno.execPath(), {
      args: ["install"],
      cwd: buildPath,
      stdout: "piped",
      stderr: "piped",
    });

    const installProcess = installCommand.spawn();
    const { code: installCode, stdout: installStdout, stderr: installStderr } = await installProcess.output();

    const installOutput = new TextDecoder().decode(installStdout);
    const installError = new TextDecoder().decode(installStderr);

    console.log(`Deno install stdout:`, installOutput);
    console.log(`Deno install stderr:`, installError);

    if (installCode !== 0) {
      console.warn(`⚠️ Deno install failed with code ${installCode}: ${installError}`);
      // Continue anyway - some projects might not need dependencies
    } else {
      console.log(`✅ Dependencies installed successfully`);
    }

    // Run wrangler deploy --dry-run --outdir ./dist
    console.log(`Running: wrangler deploy --dry-run --outdir ./dist`);
    const command = new Deno.Command("npx", {
      args: ["wrangler", "deploy", "--dry-run", "--outdir", "./dist"],
      cwd: buildPath,
      stdout: "piped",
      stderr: "piped",
      env: {}
    });

    const process = command.spawn();
    const { code, stdout, stderr } = await process.output();

    const wranglerOutput = new TextDecoder().decode(stdout);
    const errorOutput = new TextDecoder().decode(stderr);

    console.log(`Wrangler stdout:`, wranglerOutput);
    console.log(`Wrangler stderr:`, errorOutput);

    if (code !== 0) {
      throw new Error(`Wrangler deploy failed with code ${code}: ${errorOutput}`);
    }

    // Read the bundled output from dist/main.js
    const distPath = join(buildPath, "dist");
    const mainJsPath = join(distPath, "main.js");

    console.log(`Reading bundle from: ${mainJsPath}`);

    try {
      const bundleContent = await Deno.readTextFile(mainJsPath);
      console.log(`Bundle created successfully, size: ${bundleContent.length} characters`);

      // Return the output content as base64
      return { base64: btoa(unescape(encodeURIComponent(bundleContent))) };
    } catch (e) {
      // List files in dist directory for debugging
      try {
        const distFiles = [];
        for await (const entry of Deno.readDir(distPath)) {
          distFiles.push(entry.name);
        }
        console.log(`Files in dist directory:`, distFiles);
      } catch {
        console.log(`Dist directory does not exist or is empty`);
      }
      throw new Error(`Failed to read bundle output from ${mainJsPath}: ${e}`);
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    throw new Error(`Build failed: ${err.message}`);
  } finally {
    // Clean up build directory
    try {
      Deno.remove(buildPath, { recursive: true }).catch(() => { });
      console.log(`Cleaned up build directory: ${buildPath}`);
    } catch (cleanupError) {
      console.warn(`Failed to clean up build directory: ${cleanupError}`);
    }
  }
};

export default build;
