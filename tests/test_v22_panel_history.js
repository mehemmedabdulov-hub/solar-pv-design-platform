"use strict";
const assert = require("assert");
const { CommandStack } = require("../panel-editor.js");

const events = [];
const stack = new CommandStack(3);
stack.subscribe(state => events.push({ ...state }));
let value = 0;
function command(label, delta) {
  const before = value;
  const after = value + delta;
  value = after;
  stack.record({ label, undo: () => { value = before; }, redo: () => { value = after; } });
}

command("add", 1);
command("move", 10);
command("rotate", 100);
assert.strictEqual(value, 111);
assert.strictEqual(stack.canUndo(), true);
assert.strictEqual(stack.canRedo(), false);
assert.strictEqual(stack.undo(), true);
assert.strictEqual(value, 11);
assert.strictEqual(stack.undo(), true);
assert.strictEqual(value, 1);
assert.strictEqual(stack.redo(), true);
assert.strictEqual(value, 11);
command("delete", -1);
assert.strictEqual(value, 10);
assert.strictEqual(stack.canRedo(), false, "new command must clear redo branch");
command("lock", 5);
assert.strictEqual(stack.undoStack.length, 3, "history must enforce configured limit");
stack.clear();
assert.strictEqual(stack.canUndo(), false);
assert.strictEqual(stack.canRedo(), false);
assert(events.length >= 8, "history subscribers must receive state changes");
console.log("v2.2 panel command history: PASS");
