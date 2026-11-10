// Import from a real file, not node -e: the Copilot SDK resolves runtime binaries relative to import.meta.url.
import { CopilotClient } from "@github/copilot-sdk";
if(typeof CopilotClient!=="function")throw new Error("CopilotClient SDK export missing");
console.log("Atha Copilot SDK module import verified; no model request or token used");
