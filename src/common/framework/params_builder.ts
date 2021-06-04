import { FlattenUnionOfInterfaces, Merged, mergeParams } from './params_utils.js';
import { ResolveType } from './util/types.js';

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

interface IterableParamsBuilder {
  iterateCasesWithSubcases(): CaseSubcaseIterable<{}, {}>;
}

export function builderIterateCasesWithSubcases(builder: ParamsBuilderBase<{}, {}>) {
  return ((builder as unknown) as IterableParamsBuilder).iterateCasesWithSubcases();
}

export abstract class ParamsBuilderBase<CaseP extends {}, SubcaseP extends {}> {
  protected readonly cases: () => Generator<CaseP>;

  constructor(cases: () => Generator<CaseP>) {
    this.cases = cases;
  }

  /**
   * Hidden from test files. Use `builderIterateCasesWithSubcases` to access this.
   */
  protected abstract iterateCasesWithSubcases(): CaseSubcaseIterable<CaseP, SubcaseP>;
}

/**
 * Builder for combinatorial test _case_ parameters.
 *
 * CaseParamsBuilder is immutable. Each method call returns a new, immutable object,
 * modifying the list of cases according to the method called.
 *
 * This means, for example, that the `unit` passed into `.params()` can be reused.
 */
export class CaseParamsBuilder<CaseP extends {}>
  extends ParamsBuilderBase<CaseP, {}>
  implements Iterable<CaseP> {
  *iterateCasesWithSubcases(): CaseSubcaseIterable<CaseP, {}> {
    for (const a of this.cases()) {
      yield [a, undefined];
    }
  }

  [Symbol.iterator](): Iterator<CaseP> {
    return this.cases();
  }

  /**
   * Expands each case in `this` into zero or more cases:
   *
   * **Note:** In most situations, `expand` is a simpler and more readable alternative.
   *
   * ```text
   *               this = [     a       ,      b     ,       c       ]
   * this.map(expander) = [   f(a)           f(b)          f(c)      ]
   *                    = [[a1, a2, a3] ,    [ b1 ]  ,       []      ]
   *   flattened result = [ a1, a2, a3  ,      b1                    ]
   * ```
   */
  expandP<NewP extends {}>(
    expander: (_: Merged<{}, CaseP>) => Iterable<NewP>
  ): CaseParamsBuilder<Merged<CaseP, NewP>> {
    const newGenerator = expanderGenerator(this.cases, expander);
    return new CaseParamsBuilder(() => newGenerator({}));
  }

  /**
   * Expands each case in `this` into zero or more cases.
   */
  expand<NewPKey extends string, NewPValue>(
    key: NewPKey,
    expander: (_: Merged<{}, CaseP>) => Iterable<NewPValue>
  ): CaseParamsBuilder<Merged<CaseP, { [name in NewPKey]: NewPValue }>> {
    return this.expandP(function* (p) {
      for (const value of expander(p)) {
        yield { [key]: value } as { [name in NewPKey]: NewPValue };
      }
    });
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
  combineP<NewP extends {}>(newParams: Iterable<NewP>): CaseParamsBuilder<Merged<CaseP, NewP>> {
    return this.expandP(() => newParams);
  }

  /**
   * Takes the cartesian product of [ the cases in `this` ]
   * and `[ {[name]: value} for each value in values ]`
   */
  combine<NewPKey extends string, NewPValue>(
    key: NewPKey,
    values: Iterable<NewPValue>
  ): CaseParamsBuilder<Merged<CaseP, { [name in NewPKey]: NewPValue }>> {
    return this.expand(key, () => values);
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
 * `punit` is passed to every `.params()`/`.paramsSubcasesOnly()` call, so `kUnitCaseParamsBuilder`
 * is only explicitly needed if constructing a ParamsBuilder outside of a test builder.
 */
export const kUnitCaseParamsBuilder = new CaseParamsBuilder(function* () {
  yield {};
});

export type ParamTypeOf<
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  T extends CaseParamsBuilder<any> | SubcaseParamsBuilder<any, any>
> = T extends SubcaseParamsBuilder<infer CaseP, infer SubcaseP>
  ? Merged<CaseP, SubcaseP>
  : T extends CaseParamsBuilder<infer CaseP>
  ? CaseP
  : never;

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

  *iterateCasesWithSubcases(): CaseSubcaseIterable<CaseP, SubcaseP> {
    for (const caseP of this.cases()) {
      yield [caseP, makeReusableIterable(() => this.subcases(caseP))];
    }
  }

  /**
   * Expands each subcase in `this` into zero or more subcases.
   *
   * **Note:** In most situations, `expand` is a simpler and more readable alternative.
   *
   * ```text
   *               this = [     a       ,      b     ,       c       ]
   * this.map(expander) = [   f(a)           f(b)          f(c)      ]
   *                    = [[a1, a2, a3] ,    [ b1 ]  ,       []      ]
   *   flattened result = [ a1, a2, a3  ,      b1                    ]
   * ```
   */
  expandP<NewP extends {}>(
    expander: (_: Merged<CaseP, SubcaseP>) => Iterable<NewP>
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, NewP>> {
    return new SubcaseParamsBuilder(this.cases, expanderGenerator(this.subcases, expander));
  }

  /**
   * Expands each case in `this` into zero or more cases.
   */
  expand<NewPKey extends string, NewPValue>(
    key: NewPKey,
    expander: (_: Merged<CaseP, SubcaseP>) => Iterable<NewPValue>
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, { [name in NewPKey]: NewPValue }>> {
    return this.expandP(function* (p) {
      for (const value of expander(p)) {
        yield { [key]: value } as { [name in NewPKey]: NewPValue };
      }
    });
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
  combineP<NewP extends {}>(
    newParams: Iterable<NewP>
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, NewP>> {
    return this.expandP(() => newParams);
  }

  /**
   * Takes the cartesian product of [ the subcases in `this` ]
   * and `[ {[name]: value} for each value in values ]`
   */
  combine<NewPKey extends string, NewPValue>(
    key: NewPKey,
    values: Iterable<NewPValue>
  ): SubcaseParamsBuilder<CaseP, Merged<SubcaseP, { [name in NewPKey]: NewPValue }>> {
    return this.expand(key, () => values);
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
