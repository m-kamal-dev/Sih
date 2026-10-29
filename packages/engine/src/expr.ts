/**
 * Safe expression evaluator for rule `assert:` strings.
 * A tiny recursive-descent parser + evaluator. No `eval`, no `new Function`.
 * Grammar:
 *   expr   := or
 *   or     := and ("||" and)*
 *   and    := cmp ("&&" cmp)*
 *   cmp    := add (("=="|"!="|"<"|"<="|">"|">=") add)?
 *   add    := mul (("+"|"-") mul)*
 *   mul    := unary (("*"|"/"|"%") unary)*
 *   unary  := ("!"|"-"|"not ") unary | call
 *   call   := member ("(" args? ")")?
 *   member := primary ("." IDENT)*
 *   primary:= NUMBER | STRING | "null" | "true" | "false" | IDENT | "(" expr ")"
 * Values: number | string | boolean | null. Fact values are injected as an object.
 * Function names must appear in the whitelist below.
 */

export type ExprValue = number | string | boolean | null;

/** Variables available to an expression: flat fact values or nested objects for dotted access. */
export type ExprVars = Record<string, ExprValue | Record<string, ExprValue>>;

export class ExprError extends Error {}

/** Object.prototype-safe hasOwnProperty (guards `__proto__`/`constructor` keys). */
function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ident"; v: string }
  | { t: "op"; v: string }
  | { t: "eof" };

const OPERATORS = ["==", "!=", "<=", ">=", "&&", "||", "<", ">", "+", "-", "*", "/", "%", "!", ".", "(", ")", ","];

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/[0-9]/.test(c ?? "")) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j] as string)) j++;
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === "'" || c === '"') {
      // Reject escapes so the surface stays tiny and reviewable.
      src = src;
      const q = c;
      let j = i + 1;
      let out = "";
      while (j < src.length && src[j] !== q) {
        out += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError("Unterminated string in expression");
      toks.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c ?? "")) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] as string)) j++;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "&" || c === "|") {
      const next = src[i + 1];
      if (next === c) {
        toks.push({ t: "op", v: c + c });
        i += 2;
        continue;
      }
      throw new ExprError(`Unexpected single ${String(c)} in expression`);
    }
    const two = src.slice(i, i + 2);
    if (OPERATORS.includes(two)) {
      toks.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (OPERATORS.includes(c as string)) {
      toks.push({ t: "op", v: c as string });
      i += 1;
      continue;
    }
    throw new ExprError(`Unexpected character ${String(c)} in expression`);
  }
  toks.push({ t: "eof" });
  return toks;
}

type Node =
  | { k: "lit"; v: ExprValue }
  | { k: "ident"; path: string[] }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "un"; op: string; e: Node }
  | { k: "call"; name: string; args: Node[] };

class Parser {
  private pos = 0;
  constructor(private readonly toks: Tok[]) {}

  private peek(): Tok {
    const t = this.toks[this.pos];
    return t ?? { t: "eof" };
  }
  private next(): Tok {
    const t = this.peek();
    this.pos++;
    return t;
  }
  private expectOp(op: string) {
    const t = this.peek();
    if (t.t === "op" && t.v === op) {
      this.pos++;
      return;
    }
    throw new ExprError(`Expected ${op}, got ${JSON.stringify(t)}`);
  }

  parse(): Node {
    const n = this.parseOr();
    if (this.peek().t !== "eof") throw new ExprError("Unexpected trailing tokens in expression");
    return n;
  }

  private is(v: string): boolean {
    const t = this.peek();
    return t.t === "op" && t.v === v;
  }
  private anyOf(...vs: string[]): boolean {
    const t = this.peek();
    return t.t === "op" && vs.includes(t.v);
  }

  private parseOr(): Node {
    let l = this.parseAnd();
    while (this.is("||")) {
      this.pos++;
      const r = this.parseAnd();
      l = { k: "bin", op: "||", l, r };
    }
    return l;
  }
  private parseAnd(): Node {
    let l = this.parseCmp();
    while (this.is("&&")) {
      this.pos++;
      const r = this.parseCmp();
      l = { k: "bin", op: "&&", l, r };
    }
    return l;
  }
  private parseCmp(): Node {
    const l = this.parseAdd();
    if (this.anyOf("==", "!=", "<", "<=", ">", ">=")) {
      const op = (this.next() as { t: "op"; v: string }).v;
      const r = this.parseAdd();
      return { k: "bin", op, l, r };
    }
    return l;
  }
  private parseAdd(): Node {
    let l = this.parseMul();
    while (this.is("+") || this.is("-")) {
      const op = (this.next() as { t: "op"; v: string }).v;
      const r = this.parseMul();
      l = { k: "bin", op, l, r };
    }
    return l;
  }
  private parseMul(): Node {
    let l = this.parseUnary();
    while (this.anyOf("*", "/", "%")) {
      const op = (this.next() as { t: "op"; v: string }).v;
      const r = this.parseUnary();
      l = { k: "bin", op, l, r };
    }
    return l;
  }
  private parseUnary(): Node {
    if (this.is("!") || this.is("-")) {
      const op = (this.next() as { t: "op"; v: string }).v;
      return { k: "un", op, e: this.parseUnary() };
    }
    const t = this.peek();
    if (t.t === "ident" && t.v === "not") {
      // allow `not x` spelled with a space
      this.pos++;
      return { k: "un", op: "!", e: this.parseUnary() };
    }
    return this.parseCall();
  }
  private parseCall(): Node {
    let e = this.parseMember();
    if (this.is("(")) {
      if (e.k !== "ident" || e.path.length !== 1) throw new ExprError("Only plain function calls are allowed");
      const name = e.path[0] as string;
      this.pos++;
      const args: Node[] = [];
      if (!this.is(")")) {
        args.push(this.parseOr());
        while (this.is(",")) {
          this.pos++;
          args.push(this.parseOr());
        }
      }
      this.expectOp(")");
      e = { k: "call", name, args };
    }
    return e;
  }
  private parseMember(): Node {
    const t = this.next();
    let base: Node;
    if (t.t === "num") base = { k: "lit", v: t.v };
    else if (t.t === "str") base = { k: "lit", v: t.v };
    else if (t.t === "ident") {
      if (t.v.startsWith("__")) throw new ExprError(`Forbidden identifier ${t.v}`);
      if (t.v === "null") base = { k: "lit", v: null };
      else if (t.v === "true") base = { k: "lit", v: true };
      else if (t.v === "false") base = { k: "lit", v: false };
      else base = { k: "ident", path: [t.v] };
    } else if (t.t === "op" && t.v === "(") {
      base = this.parseOr();
      this.expectOp(")");
    } else throw new ExprError(`Unexpected token ${JSON.stringify(t)}`);
    while (this.is(".")) {
      this.pos++;
      const id = this.next();
      if (id.t !== "ident") throw new ExprError("Expected identifier after '.'");
      if (base.k !== "ident") throw new ExprError("Member access only on lookup paths");
      base = { k: "ident", path: [...base.path, id.v] };
    }
    return base;
  }
}

/* ---------------- Whitelisted pure helpers ---------------- */

export const BUILTIN_FUNCTIONS: Record<string, (args: ExprValue[]) => ExprValue> = {
  min: (a) => Math.min(...nums(a)),
  max: (a) => Math.max(...nums(a)),
  /** Parse a fact value that may be a display string ("5.00", "25,00,000"). */
  num: (a) => {
    if (a.length !== 1) throw new ExprError("num expects one value");
    try {
      return num(a[0]);
    } catch {
      return null; // non-numeric value parses as null; ordering rules route to insufficient evidence
    }
  },
  abs: (a) => Math.abs(num(a[0])),
  round: (a) => Math.round(num(a[0])),
  floor: (a) => Math.floor(num(a[0])),
  /* ISO date strings compare correctly as strings; days_between keeps rules readable */
  days_between: (a) => (Date.parse(str_(a[0])) - Date.parse(str_(a[1]))) / 86_400_000,
  missing: (a) => a.length === 0 || a[0] === null || a[0] === undefined,
  /* An empty or whitespace-only read is not a present value. */
  present: (a) => a.length > 0 && a[0] !== null && a[0] !== undefined && String(a[0]).trim() !== "",
  /**
   * Required-fact guard used by presence rules: throws MissingFact when its
   * argument is absent so the engine maps it to the rule's `on_fail`
   * (e.g. completeness_gap), not to insufficient evidence — the item is
   * missing, not unreadable enough.
   */
  required: (a) => {
    if (a.length === 0 || a[0] == null || a[0] === "") {
      throw new MissingFactError();
    }
    return a[0];
  },
  len: (a) => {
    if (typeof a[0] === "string") return a[0].length;
    throw new ExprError("len expects a string");
  },
  lower: (a) => str_(a[0]).toLowerCase(),
  upper: (a) => str_(a[0]).toUpperCase(),
};

export class MissingFactError extends Error {}

function nums(a: ExprValue[]): number[] {
  return a.map(num);
}
function num(v: ExprValue | undefined): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[\s,]/g, ""); // tolerate Indian-style grouping ("25,00,000") and stray spaces
    if (cleaned !== "" && Number.isFinite(Number(cleaned))) return Number(cleaned);
  }
  throw new ExprError(`Expected number, got ${JSON.stringify(v)}`);
}
function str_(v: ExprValue | undefined): string {
  if (typeof v === "string") return v;
  throw new ExprError(`Expected string, got ${JSON.stringify(v)}`);
}

export function evalNode(n: Node, vars: ExprVars): ExprValue {
  switch (n.k) {
    case "lit":
      return n.v;
    case "ident": {
      // First try the whole dotted path as a flat fact key ("fire_noc.valid_until"),
      // then fall back to nested object access. Prototype keys are banned.
      const full = n.path.join(".");
      const varsObj = vars as Record<string, ExprValue>;
      if (hasOwn(varsObj, full)) {
        const v = varsObj[full];
        return typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v === null ? v : null;
      }
      const head = n.path[0] as string;
      if (!hasOwn(varsObj, head)) return null; // unknown fact reads as null; rules decide `missing`
      let cur: ExprValue = varsObj[head] ?? null;
      for (const p of n.path.slice(1)) {
        if (cur === null || typeof cur !== "object") return null;
        cur = hasOwn(cur as Record<string, ExprValue>, p) ? ((cur as unknown as Record<string, ExprValue>)[p] as ExprValue) ?? null : null;
      }
      return cur;
    }
    case "un": {
      const v = evalNode(n.e, vars);
      if (n.op === "!") return !v;
      return -num(v); // unary minus
    }
    case "bin":
      return evalBin(n.op, n.l, n.r, vars);
    case "call": {
      const fn = BUILTIN_FUNCTIONS[n.name];
      if (!fn) throw new ExprError(`Function ${n.name} is not in the whitelist`);
      return fn(n.args.map((a) => evalNode(a, vars)));
    }
  }
}

function evalBin(
  op: string,
  l: Node,
  r: Node,
  vars: ExprVars,
): ExprValue {
  /* short-circuit the logical ones */
  if (op === "&&") {
    const lv = evalNode(l, vars);
    if (!lv) return lv;
    return evalNode(r, vars);
  }
  if (op === "||") {
    const lv = evalNode(l, vars);
    if (lv) return lv;
    return evalNode(r, vars);
  }
  const a = evalNode(l, vars);
  const b = evalNode(r, vars);
  switch (op) {
    case "==": {
      return valuesEqual(a, b);
    }
    case "!=":
      return !valuesEqual(a, b);
    case "<":
    case "<=":
    case ">":
    case ">=":
      return compareOrdered(a, b, op);
    case "+":
      return addValues(a, b);
    case "-":
      return num(a) - num(b);
    case "*":
      return num(a) * num(b);
    case "/":
      return num(a) / num(b);
    case "%":
      return num(a) % num(b);
  }
  throw new ExprError(`Unknown operator ${op}`);
}

function valuesEqual(a: ExprValue, b: ExprValue): boolean {
  if (typeof a === "number" && typeof b === "string" && Number.isFinite(Number(b))) return a === Number(b);
  if (typeof b === "number" && typeof a === "string" && Number.isFinite(Number(a))) return Number(a) === b;
  return a === b;
}

function compareOrdered(a: ExprValue, b: ExprValue, op: string): boolean {
  let x: number | string = a as number | string;
  let y: number | string = b as number | string;
  if (typeof x === "number" && typeof y === "string") y = Number(y);
  if (typeof x === "string" && typeof y === "number") x = Number(x);
  if (x === null || y === null) throw new ExprError(`Cannot order null (${String(a)} vs ${String(b)})`);
  if (typeof x === "number" && typeof y === "number") {
    return op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
  }
  if (typeof x === "string" && typeof y === "string") {
    // ISO dates and plain strings compare lexicographically.
    return op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
  }
  throw new ExprError(`Cannot order ${JSON.stringify(x)} and ${JSON.stringify(y)}`);
}

function addValues(a: ExprValue, b: ExprValue): ExprValue {
  if (typeof a === "string" || typeof b === "string") {
    const s = String(a) + String(b);
    return s;
  }
  return num(a) + num(b);
}

/* ---------------- Public API ---------------- */

export const parsedCache = new Map<string, Node>();

export function parseExpr(src: string): Node {
  const cached = parsedCache.get(src);
  if (cached) return cached;
  const node = new Parser(tokenize(src)).parse();
  parsedCache.set(src, node);
  return node;
}

export function evalExpr(src: string, vars: ExprVars = {}): ExprValue {
  return evalNode(parseExpr(src), vars);
}

/** Parse-only check used by the rule loader and the rule editor. */
export function validateExpr(src: string): { ok: true } | { ok: false; error: string } {
  try {
    parseExpr(src);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
