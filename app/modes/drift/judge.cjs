// A literal CommonJS import is statically bundled by Next. Unlike an ES import,
// putting it in try/catch also lets the build proceed without this optional file.
/** @returns {import("./grouping").DriftJudge | undefined} */
exports.loadStoredJudge = function loadStoredJudge() {
  try {
    return require("../../../data/drift/judge.json");
  } catch (error) {
    if (error.code === "MODULE_NOT_FOUND") return undefined;
    throw error;
  }
};
