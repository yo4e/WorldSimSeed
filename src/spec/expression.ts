import { WorldSimError } from "../errors.js";

export type Scalar = number | boolean;

export type ExpressionNode =
  | { kind: "number"; value: number }
  | { kind: "reference"; name: string }
  | { kind: "unary"; op: "-" | "not"; value: ExpressionNode }
  | {
      kind: "binary";
      op:
        | "+"
        | "-"
        | "*"
        | "/"
        | "<"
        | "<="
        | ">"
        | ">="
        | "=="
        | "!="
        | "and"
        | "or";
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | {
      kind: "call";
      name: "min" | "max" | "abs" | "clamp";
      args: ExpressionNode[];
    };

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: string }
  | { kind: "leftParen" }
  | { kind: "rightParen" }
  | { kind: "comma" }
  | { kind: "eof" };

export interface ExpressionContext {
  tick: number;
  agent?: Record<string, Scalar>;
  world?: Record<string, Scalar>;
  param: Record<string, Scalar>;
}

const allowedFunctions = new Set(["min", "max", "abs", "clamp"]);

export function parseExpression(source: string): ExpressionNode {
  const parser = new Parser(tokenize(source));
  const expression = parser.parse();
  return expression;
}

export function evaluateExpression(
  node: ExpressionNode,
  context: ExpressionContext,
): Scalar {
  switch (node.kind) {
    case "number":
      return node.value;

    case "reference":
      return readReference(node.name, context);

    case "unary": {
      const value = evaluateExpression(node.value, context);
      if (node.op === "not") {
        if (typeof value !== "boolean") {
          throw expressionError("'not' requires a boolean operand.");
        }
        return !value;
      }
      return finiteNumber(-requireNumber(value, "Unary '-'"));
    }

    case "binary":
      return evaluateBinary(node, context);

    case "call":
      return evaluateCall(node, context);
  }
}

export function collectReferences(node: ExpressionNode): string[] {
  const refs = new Set<string>();
  walk(node, (child) => {
    if (child.kind === "reference") refs.add(child.name);
  });
  return [...refs];
}

function walk(node: ExpressionNode, visit: (node: ExpressionNode) => void): void {
  visit(node);
  if (node.kind === "unary") {
    walk(node.value, visit);
  } else if (node.kind === "binary") {
    walk(node.left, visit);
    walk(node.right, visit);
  } else if (node.kind === "call") {
    for (const arg of node.args) walk(arg, visit);
  }
}

function evaluateBinary(
  node: Extract<ExpressionNode, { kind: "binary" }>,
  context: ExpressionContext,
): Scalar {
  const left = evaluateExpression(node.left, context);

  if (node.op === "and") {
    if (typeof left !== "boolean") {
      throw expressionError("'and' requires boolean operands.");
    }
    if (!left) return false;
    const right = evaluateExpression(node.right, context);
    if (typeof right !== "boolean") {
      throw expressionError("'and' requires boolean operands.");
    }
    return right;
  }

  if (node.op === "or") {
    if (typeof left !== "boolean") {
      throw expressionError("'or' requires boolean operands.");
    }
    if (left) return true;
    const right = evaluateExpression(node.right, context);
    if (typeof right !== "boolean") {
      throw expressionError("'or' requires boolean operands.");
    }
    return right;
  }

  const right = evaluateExpression(node.right, context);

  switch (node.op) {
    case "+":
      return finiteNumber(
        requireNumber(left, "'+'") + requireNumber(right, "'+'"),
      );
    case "-":
      return finiteNumber(
        requireNumber(left, "'-'") - requireNumber(right, "'-'"),
      );
    case "*":
      return finiteNumber(
        requireNumber(left, "'*'") * requireNumber(right, "'*'"),
      );
    case "/": {
      const divisor = requireNumber(right, "'/'");
      if (divisor === 0) {
        throw new WorldSimError("NUMERIC_ERROR", "Division by zero.");
      }
      return finiteNumber(requireNumber(left, "'/'") / divisor);
    }
    case "<":
      return requireNumber(left, "'<'") < requireNumber(right, "'<'");
    case "<=":
      return requireNumber(left, "'<='") <= requireNumber(right, "'<='");
    case ">":
      return requireNumber(left, "'>'") > requireNumber(right, "'>'");
    case ">=":
      return requireNumber(left, "'>='") >= requireNumber(right, "'>='");
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    default:
      throw expressionError("Unsupported binary operator.");
  }
}

function evaluateCall(
  node: Extract<ExpressionNode, { kind: "call" }>,
  context: ExpressionContext,
): Scalar {
  const args = node.args.map((arg) =>
    requireNumber(evaluateExpression(arg, context), `${node.name}()`),
  );

  switch (node.name) {
    case "min":
      assertArity(node.name, args, 2);
      return finiteNumber(Math.min(args[0]!, args[1]!));
    case "max":
      assertArity(node.name, args, 2);
      return finiteNumber(Math.max(args[0]!, args[1]!));
    case "abs":
      assertArity(node.name, args, 1);
      return finiteNumber(Math.abs(args[0]!));
    case "clamp":
      assertArity(node.name, args, 3);
      if (args[1]! > args[2]!) {
        throw expressionError("clamp() lower bound exceeds upper bound.");
      }
      return finiteNumber(Math.min(args[2]!, Math.max(args[1]!, args[0]!)));
  }
}

function readReference(name: string, context: ExpressionContext): Scalar {
  if (name === "tick") return context.tick;

  const [root, field, ...rest] = name.split(".");
  if (!root || !field || rest.length > 0) {
    throw expressionError(`Invalid reference '${name}'.`);
  }

  if (field === "__proto__" || field === "prototype" || field === "constructor") {
    throw expressionError(`Dangerous reference '${name}' is not allowed.`);
  }

  if (root === "agent") {
    if (!context.agent || !(field in context.agent)) {
      throw expressionError(`Unknown reference '${name}'.`);
    }
    return context.agent[field]!;
  }

  if (root === "world") {
    if (!context.world || !(field in context.world)) {
      throw expressionError(`Unknown reference '${name}'.`);
    }
    return context.world[field]!;
  }

  if (root === "param") {
    if (!(field in context.param)) {
      throw expressionError(`Unknown reference '${name}'.`);
    }
    return context.param[field]!;
  }

  throw expressionError(`Reference root '${root}' is not allowed.`);
}

function requireNumber(value: Scalar, operation: string): number {
  if (typeof value !== "number") {
    throw expressionError(`${operation} requires numeric operands.`);
  }
  return finiteNumber(value);
}

function finiteNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new WorldSimError(
      "NUMERIC_ERROR",
      "Expression produced a non-finite number.",
    );
  }
  return value;
}

function assertArity(name: string, args: number[], expected: number): void {
  if (args.length !== expected) {
    throw expressionError(
      `${name}() expects ${expected} argument(s), got ${args.length}.`,
    );
  }
}

function expressionError(message: string): WorldSimError {
  return new WorldSimError("EXPRESSION_ERROR", message);
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ExpressionNode {
    const node = this.parseOr();
    if (this.peek().kind !== "eof") {
      throw expressionError("Unexpected trailing expression input.");
    }
    return node;
  }

  private parseOr(): ExpressionNode {
    let node = this.parseAnd();
    while (this.matchOperator("or")) {
      node = {
        kind: "binary",
        op: "or",
        left: node,
        right: this.parseAnd(),
      };
    }
    return node;
  }

  private parseAnd(): ExpressionNode {
    let node = this.parseComparison();
    while (this.matchOperator("and")) {
      node = {
        kind: "binary",
        op: "and",
        left: node,
        right: this.parseComparison(),
      };
    }
    return node;
  }

  private parseComparison(): ExpressionNode {
    let node = this.parseAdditive();

    while (
      this.peekOperator("<") ||
      this.peekOperator("<=") ||
      this.peekOperator(">") ||
      this.peekOperator(">=") ||
      this.peekOperator("==") ||
      this.peekOperator("!=")
    ) {
      const token = this.consume() as Extract<Token, { kind: "operator" }>;
      node = {
        kind: "binary",
        op: token.value as Extract<
          ExpressionNode,
          { kind: "binary" }
        >["op"],
        left: node,
        right: this.parseAdditive(),
      };
    }

    return node;
  }

  private parseAdditive(): ExpressionNode {
    let node = this.parseMultiplicative();
    while (this.peekOperator("+") || this.peekOperator("-")) {
      const token = this.consume() as Extract<Token, { kind: "operator" }>;
      node = {
        kind: "binary",
        op: token.value as "+" | "-",
        left: node,
        right: this.parseMultiplicative(),
      };
    }
    return node;
  }

  private parseMultiplicative(): ExpressionNode {
    let node = this.parseUnary();
    while (this.peekOperator("*") || this.peekOperator("/")) {
      const token = this.consume() as Extract<Token, { kind: "operator" }>;
      node = {
        kind: "binary",
        op: token.value as "*" | "/",
        left: node,
        right: this.parseUnary(),
      };
    }
    return node;
  }

  private parseUnary(): ExpressionNode {
    if (this.matchOperator("not")) {
      return { kind: "unary", op: "not", value: this.parseUnary() };
    }
    if (this.matchOperator("-")) {
      return { kind: "unary", op: "-", value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ExpressionNode {
    const token = this.consume();

    if (token.kind === "number") {
      return { kind: "number", value: token.value };
    }

    if (token.kind === "identifier") {
      if (this.peek().kind === "leftParen") {
        if (!allowedFunctions.has(token.value)) {
          throw expressionError(`Function '${token.value}' is not allowed.`);
        }
        this.consume();

        const args: ExpressionNode[] = [];
        if (this.peek().kind !== "rightParen") {
          do {
            args.push(this.parseOr());
          } while (this.match("comma"));
        }

        this.expect("rightParen");
        return {
          kind: "call",
          name: token.value as "min" | "max" | "abs" | "clamp",
          args,
        };
      }

      if (
        token.value !== "tick" &&
        !/^(agent|world|param)\.[A-Za-z_][A-Za-z0-9_]*$/.test(token.value)
      ) {
        throw expressionError(`Identifier '${token.value}' is not allowed.`);
      }

      return { kind: "reference", name: token.value };
    }

    if (token.kind === "leftParen") {
      const node = this.parseOr();
      this.expect("rightParen");
      return node;
    }

    throw expressionError("Expected a number, reference, function, or group.");
  }

  private match(kind: Token["kind"]): boolean {
    if (this.peek().kind !== kind) return false;
    this.index += 1;
    return true;
  }

  private matchOperator(value: string): boolean {
    if (!this.peekOperator(value)) return false;
    this.index += 1;
    return true;
  }

  private peekOperator(value: string): boolean {
    const token = this.peek();
    return token.kind === "operator" && token.value === value;
  }

  private expect(kind: Token["kind"]): void {
    if (!this.match(kind)) {
      throw expressionError(`Expected token '${kind}'.`);
    }
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: "eof" };
  }

  private consume(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    const number = source
      .slice(index)
      .match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value)) {
        throw expressionError("Non-finite numeric literal.");
      }
      tokens.push({ kind: "number", value });
      index += number[0].length;
      continue;
    }

    const identifier = source
      .slice(index)
      .match(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/);
    if (identifier) {
      const value = identifier[0];
      if (value === "and" || value === "or" || value === "not") {
        tokens.push({ kind: "operator", value });
      } else {
        tokens.push({ kind: "identifier", value });
      }
      index += value.length;
      continue;
    }

    const two = source.slice(index, index + 2);
    if (["<=", ">=", "==", "!="].includes(two)) {
      tokens.push({ kind: "operator", value: two });
      index += 2;
      continue;
    }

    if (["+", "-", "*", "/", "<", ">"].includes(char)) {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ kind: "leftParen" });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ kind: "rightParen" });
      index += 1;
      continue;
    }

    if (char === ",") {
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }

    throw expressionError(`Unsupported character '${char}'.`);
  }

  tokens.push({ kind: "eof" });
  return tokens;
}
