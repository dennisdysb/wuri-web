/* 回归预载：把 lunar-javascript 与引擎历法提供者装进全局，然后由各测试文件自跑。
 * 用法：node -r ./preload.js <testfile> [args...] */
const fs = require("fs"), vm = require("vm"), path = require("path");
global.window = globalThis;
const WWW = path.join(__dirname, "../../www");
vm.runInThisContext(fs.readFileSync(path.join(WWW, "js/lunar.min.js"), "utf8"), { filename: "lunar.min.js" });
if (!global.Solar) { console.error("lunar 未挂载 Solar"); process.exit(2); }
global.QM = require(path.join(WWW, "js/qimen-engine.js"));
vm.runInThisContext(fs.readFileSync(path.join(WWW, "js/qimen-cal.js"), "utf8"), { filename: "qimen-cal.js" });
