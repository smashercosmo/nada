import { intro, note, text } from "@clack/prompts";
import {type CANCEL_SYMBOL, intro} from "@clack/prompts"

import { cancel, isCancel } from "@clack/prompts"
import process from "node:process"

class Prompts {
  intro(message: string) {
    if (process.NODE_ENV === "test" && process.send) {
      process.send({ type: '@clack/event', command: 'intro', content: message });
    }
  }
}
