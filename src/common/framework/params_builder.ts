import {
  TestParams,
  TestParamsIterable,
  FlattenUnionOfInterfaces,
  Merged,
  mergeParams,
  publicParamsEquals,
} from './params_utils.js';
import { ResolveType, UnionToIntersection } from './util/types.js';

/** Conditionally chooses between two types depending on whether T is a union. */
type CheckForUnion<T, TIfNotUnion, TIfUnion> = [T] extends [UnionToIntersection<T>]
  ? TIfUnion
  : TIfNotUnion;

/** Conditionally chooses a type (or void) depending on whether T is a string. */
type CheckForStringLiteralType<T, TOk> = string extends T ? void : CheckForUnion<T, void, TOk>;

/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
function typeAssert<T extends 'pass'>() {}
{
  type Test<T, U> = [T] extends [U]
    ? [U] extends [T]
      ? 'pass'
      : { actual: ResolveType<T>; expected: U }
    : { actual: ResolveType<T>; expected: U };

  type T01 = { a: number } | { b: string };
  type T02 = { a: number } | { b?: string };
  type T03 = { a: number } | { a?: number };
  type T04 = { a: number } | { a: string };
  type T05 = { a: number } | { a?: string };

  type T11 = { a: number; b?: undefined } | { a?: undefined; b: string };

  type T21 = { a: number; b?: undefined } | { b: string };
  type T22 = { a: number; b?: undefined } | { b?: string };
  type T23 = { a: number; b?: undefined } | { a?: number };
  type T24 = { a: number; b?: undefined } | { a: string };
  type T25 = { a: number; b?: undefined } | { a?: string };
  type T26 = { a: number; b?: undefined } | { a: undefined };
  type T27 = { a: number; b?: undefined } | { a: undefined; b: undefined };

  /* prettier-ignore */ {
    typeAssert<Test<FlattenUnionOfInterfaces<T01>, { a: number | undefined; b: string | undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T02>, { a: number | undefined; b: string | undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T03>, { a: number | undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T04>, { a: number | string }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T05>, { a: number | string | undefined }>>();

    typeAssert<Test<FlattenUnionOfInterfaces<T11>, { a: number | undefined; b: string | undefined }>>();

    typeAssert<Test<FlattenUnionOfInterfaces<T22>, { a: number | undefined; b: string | undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T23>, { a: number | undefined; b: undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T24>, { a: number | string; b: undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T25>, { a: number | string | undefined; b: undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T27>, { a: number | undefined; b: undefined }>>();

    // Unexpected test results - hopefully okay to ignore these
    typeAssert<Test<FlattenUnionOfInterfaces<T21>, { b: string | undefined }>>();
    typeAssert<Test<FlattenUnionOfInterfaces<T26>, { a: number | undefined }>>();
  }
}

export function poptions<Name extends string, V>(
  name: Name,
  values: Iterable<V>
): CheckForStringLiteralType<Name, Iterable<{ [name in Name]: V }>> {
  const iter = makeReusableIterable(function* () {
    for (const value of values) {
      yield { [name]: value };
    }
  });
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return iter as any;
}

/** @deprecated */
export function pbool<Name extends string>(
  name: Name
): CheckForStringLiteralType<Name, Iterable<{ [name in Name]: boolean }>> {
  return poptions(name, [false, true]);
}

/** @deprecated */
export function params(): ParamsBuilder<{}> {
  return new ParamsBuilder();
}

/** @deprecated */
export class ParamsBuilder<A extends {}> implements TestParamsIterable {
  private paramSpecs: TestParamsIterable = [{}];

  [Symbol.iterator](): Iterator<A> {
    const iter: Iterator<TestParams> = this.paramSpecs[Symbol.iterator]();
    return iter as Iterator<A>;
  }

  combine<B extends {}>(newParams: Iterable<B>): ParamsBuilder<Merged<A, B>> {
    const paramSpecs = this.paramSpecs as Iterable<A>;
    this.paramSpecs = makeReusableIterable(function* () {
      for (const a of paramSpecs) {
        for (const b of newParams) {
          yield mergeParams(a, b);
        }
      }
    }) as TestParamsIterable;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return this as any;
  }

  expand<B extends {}>(expander: (_: A) => Iterable<B>): ParamsBuilder<Merged<A, B>> {
    const paramSpecs = this.paramSpecs as Iterable<A>;
    this.paramSpecs = makeReusableIterable(function* () {
      for (const a of paramSpecs) {
        for (const b of expander(a)) {
          yield mergeParams(a, b);
        }
      }
    }) as TestParamsIterable;
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    return this as any;
  }

  filter(pred: (_: A) => boolean): ParamsBuilder<A> {
    const paramSpecs = this.paramSpecs as Iterable<A>;
    this.paramSpecs = makeReusableIterable(function* () {
      for (const p of paramSpecs) {
        if (pred(p)) {
          yield p;
        }
      }
    });
    return this;
  }

  unless(pred: (_: A) => boolean): ParamsBuilder<A> {
    return this.filter(x => !pred(x));
  }

  exclude(exclude: TestParamsIterable): ParamsBuilder<A> {
    const excludeArray = Array.from(exclude);
    const paramSpecs = this.paramSpecs;
    this.paramSpecs = makeReusableIterable(function* () {
      for (const p of paramSpecs) {
        if (excludeArray.every(e => !publicParamsEquals(p, e))) {
          yield p;
        }
      }
    });
    return this;
  }
}

// If you create an Iterable by calling a generator function (e.g. in IIFE), it is exhausted after
// one use. This just wraps a generator function in an object so it be iterated multiple times.
function makeReusableIterable<P>(generatorFn: () => Generator<P>): Iterable<P> {
  return { [Symbol.iterator]: generatorFn };
}

/**
 * Iterable over pairs of either:
 * - `[case params, Iterable<subcase params>]` if there are subcases.
 * - `[case params, undefined]` if not.
 */
export type CaseSubcaseIterable<CaseP, SubcaseP> = Iterable<
  readonly [CaseP, Iterable<SubcaseP> | undefined]
>;
type CaseSubcaseIterator<CaseP, SubcaseP> = Iterator<
  readonly [CaseP, Iterable<SubcaseP> | undefined]
>;

export abstract class ParamsBuilderBase<CaseP extends {}, SubcaseP extends {}>
  implements CaseSubcaseIterable<CaseP, SubcaseP> {
  protected readonly cases: () => Generator<CaseP>;

  constructor(cases: () => Generator<CaseP>) {
    this.cases = cases;
  }

  abstract [Symbol.iterator](): CaseSubcaseIterator<CaseP, SubcaseP>;
}

/**
 * Builder for combinatorial test _case_ parameters.
 *
 * CaseParamsBuilder is immutable. Each method call returns a new, immutable object,
 * modifying the list of cases according to the method called.
 *
 * This means, for example, that the `punit` passed into `.params2()` can be reused.
 */
export class CaseParamsBuilder<CaseP extends {}> extends ParamsBuilderBase<CaseP, {}> {
  *[Symbol.iterator](): CaseSubcaseIterator<CaseP, {}> {
    for (const a of this.cases()) {
      yield [a, undefined];
    }
  }

  /**
   * Expands each case in `this` into zero or more cases:
   *
   * ```text
   *               this = [     a       ,      b     ,       c       ]
   * this.map(expander) = [   f(a)           f(b)          f(c)      ]
   *                    = [[a1, a2, a3] ,    [ b1 ]  ,       []      ]
   *   flattened result = [ a1, a2, a3  ,      b1                    ]
   * ```
   */
  expand<NewP extends {}>(
    expander: (_: Merged<{}, CaseP>) => Iterable<NewP>
  ): CaseParamsBuilder<Merged<CaseP, NewP>> {
    const newGenerator = expanderGenerator(this.cases, expander);
    return new CaseParamsBuilder(() => newGenerator({}));
  }

  /**
   * Takes the cartesian product of [ the cases in `this` ] and `newParams`.
   *
   * ```text
   *                    this = [ {a:1}, {b:2} ]
   *               newParams = [ {x:1}, {y:2} ]
   * this.combine(newParams) = [ {a:1,x:1}, {a:1,y:2}, {b:2,x:1}, {b:2,y:2} ]
   * ```
   */
  combine<NewP extends {}>(newParams: Iterable<NewP>): CaseParamsBuilder<Merged<CaseP, NewP>> {
    return this.expand(() => newParams);
  }

  /**
   * Takes the cartesian product of [ the cases in `this` ]
   * and `[ {[name]: value} for each value in values ]`
   */
  combineOptions<NewPKey extends string, NewPValue>(
    key: NewPKey,
    values: readonly NewPValue[]
  ): CaseParamsBuilder<Merged<CaseP, { [name in NewPKey]: NewPValue }>> {
    return this.combine(
      values.map(value => ({ [key]: value } as { [name in NewPKey]: NewPValue }))
    );
  }

  /**
   * Takes the cartesian product of [ the cases in `this` ]
   * and `[ {[name]: false}, {[name]: true} ]`.
   */
  combineBoolean<NewPKey extends string>(name: NewPKey) {
    return this.combineOptions(name, [false, true]);
  }

  /**
   * Filters `this` to only cases for which `pred` returns true.
   */
  filter(pred: (_: Merged<{}, CaseP>) => boolean): CaseParamsBuilder<CaseP> {
    const newGenerator = filterGenerator(this.cases, pred);
    return new CaseParamsBuilder(() => newGenerator({}));
  }

  /**
   * Filters `this` to only cases for which `pred` returns false.
   */
  unless(pred: (_: Merged<{}, CaseP>) => boolean): CaseParamsBuilder<CaseP> {
    return this.filter(x => !pred(x));
  }

  /**
   * "Finalize" the list of cases and begin defining subcases.
   * Returns a new SubcaseParamsBuilder. Methods called on SubcaseParamsBuilder
   * generate new subcases instead of new cases.
   */
  beginSubcases(): SubcaseParamsBuilder<CaseP, {}> {
    return new SubcaseParamsBuilder(
      () => this.cases(),
      function* () {
        yield {};
      }
    );
  }
}

/**
 * The unit CaseParamsBuilder, representing a single case with no params: `[ {} ]`.
 *
 * `punit` is passed to every .params2() call, so `punit` is only explicitly needed if
 * constructing a ParamsBuilder outside of a test builder.
 */
export const kUnitCaseParamsBuilder = new CaseParamsBuilder(function* () {
  yield {};
});

/**
 * Builder for combinatorial test _subcase_ parameters.
 *
 * SubcaseParamsBuilder is immutable. Each method call returns a new, immutable object,
 * modifying the list of subcases according to the method called.
 */
export class SubcaseParamsBuilder<CaseP extends {}, SubcaseP extends {}> extends ParamsBuilderBase<
  CaseP,
  SubcaseP
> {
  protected readonly subcases: (_: CaseP) => Generator<SubcaseP>;

  constructor(cases: () => Generator<CaseP>, generator: (_: CaseP) => Generator<SubcaseP>) {
    super(cases);
    this.subcases = generator;
  }

  *[Symbol.iterator](): CaseSubcaseIterator<CaseP, SubcaseP> {
    for (const caseP of this.cases()) {
      yield [caseP, makeReusableIterable(() => this.subcases(caseP))];
    }
  }

  /**
   * Expands each subcase in `this` into zero or more subcases.
   *
   * ```text
   *               this = [     a       ,      b     ,       c       ]
   * this.map(expander) = [   f(a)           f(b)          f(c)      ]
   *                    = [[a1, a2, a3] ,    [ b1 ]  ,       []      ]
   *   flattened result = [ a1, a2, a3  ,      b1                    ]
   * ```
   */
  expand<NewP extends {}>(
    expander: (_: Merged<CaseP, SubcaseP>) => Iterable<NewP>
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, NewP>> {
    return new SubcaseParamsBuilder(this.cases, expanderGenerator(this.subcases, expander));
  }

  /**
   * Takes the cartesian product of [ the subcases in `this` ] and `newParams`.
   *
   * ```text
   *                    this = [ {a:1}, {b:2} ]
   *               newParams = [ {x:1}, {y:2} ]
   * this.combine(newParams) = [ {a:1,x:1}, {a:1,y:2}, {b:2,x:1}, {b:2,y:2} ]
   * ```
   */
  combine<NewP extends {}>(
    newParams: Iterable<NewP>
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, NewP>> {
    return this.expand(() => newParams);
  }

  /**
   * Takes the cartesian product of [ the subcases in `this` ]
   * and `[ {[name]: value} for each value in values ]`
   */
  combineOptions<NewPKey extends string, NewPValue>(
    key: NewPKey,
    values: readonly NewPValue[]
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, { [name in NewPKey]: NewPValue }>> {
    return this.combine(
      values.map(value => ({ [key]: value } as { [name in NewPKey]: NewPValue }))
    );
  }

  /**
   * Takes the cartesian product of [ the subcases in `this` ]
   * and `[ {[name]: false}, {[name]: true} ]`.
   */
  combineBoolean<NewPKey extends string>(name: NewPKey) {
    return this.combineOptions(name, [false, true]);
  }

  /**
   * Filters `this` to only subcases for which `pred` returns true.
   */
  filter(pred: (_: Merged<CaseP, SubcaseP>) => boolean): SubcaseParamsBuilder<CaseP, SubcaseP> {
    return new SubcaseParamsBuilder(this.cases, filterGenerator(this.subcases, pred));
  }

  /**
   * Filters `this` to only subcases for which `pred` returns false.
   */
  unless(pred: (_: Merged<CaseP, SubcaseP>) => boolean): SubcaseParamsBuilder<CaseP, SubcaseP> {
    return this.filter(x => !pred(x));
  }
}

function expanderGenerator<Base, A, B>(
  baseGenerator: (_: Base) => Generator<A>,
  expander: (_: Merged<Base, A>) => Iterable<B>
): (_: Base) => Generator<Merged<A, B>> {
  return function* (base: Base) {
    for (const a of baseGenerator(base)) {
      for (const b of expander(mergeParams(base, a))) {
        yield mergeParams(a, b);
      }
    }
  };
}

function filterGenerator<Base, A>(
  baseGenerator: (_: Base) => Generator<A>,
  pred: (_: Merged<Base, A>) => boolean
): (_: Base) => Generator<A> {
  return function* (base: Base) {
    for (const a of baseGenerator(base)) {
      if (pred(mergeParams(base, a))) {
        yield a;
      }
    }
  };
}
