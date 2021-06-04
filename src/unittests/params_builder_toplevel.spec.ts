export const description = `
Unit tests for parameterization.
`;

import { kUnitCaseParamsBuilder } from '../common/framework/params_builder.js';
import { TestParams } from '../common/framework/params_utils.js';
import { makeTestGroup, makeTestGroupForUnitTesting } from '../common/framework/test_group.js';

import { TestGroupTest } from './test_group_test.js';
import { UnitTest } from './unit_test.js';

export const g = makeTestGroup(TestGroupTest);

g.test('combine_none,arg_unit')
  .params2(u => u.combine([]))
  .fn(t => {
    t.fail("this test shouldn't run");
  });

g.test('combine_none,arg_ignored')
  .params2(() => kUnitCaseParamsBuilder.combine([]))
  .fn(t => {
    t.fail("this test shouldn't run");
  });

g.test('combine_none,plain_builder')
  .params2(kUnitCaseParamsBuilder.combine([]))
  .fn(t => {
    t.fail("this test shouldn't run");
  });

g.test('combine_none,plain_array')
  .cases2([])
  .fn(t => {
    t.fail("this test shouldn't run");
  });

g.test('combine_one,case')
  .params2(u =>
    u //
      .combine([{ x: 1 }])
  )
  .fn(t => {
    t.expect(t.params.x === 1);
  });

g.test('combine_one,subcase')
  .subcases2(u =>
    u //
      .combine([{ x: 1 }])
  )
  .fn(t => {
    t.expect(t.params.x === 1);
  });

g.test('filter')
  .params2(u =>
    u
      .combine([
        { a: true, x: 1 }, //
        { a: false, y: 2 },
      ])
      .filter(p => p.a)
  )
  .fn(t => {
    t.expect(t.params.a);
  });

g.test('unless')
  .params2(u =>
    u
      .combine([
        { a: true, x: 1 }, //
        { a: false, y: 2 },
      ])
      .unless(p => p.a)
  )
  .fn(t => {
    t.expect(!t.params.a);
  });

g.test('generator').fn(t0 => {
  const g = makeTestGroupForUnitTesting(UnitTest);

  const ran: TestParams[] = [];

  g.test('generator')
    .params2(u =>
      u.combine(
        (function* () {
          for (let x = 0; x < 3; ++x) {
            for (let y = 0; y < 2; ++y) {
              yield { x, y };
            }
          }
        })()
      )
    )
    .fn(t => {
      ran.push(t.params);
    });

  t0.expectCases(g, [
    { test: ['generator'], params: { x: 0, y: 0 } },
    { test: ['generator'], params: { x: 0, y: 1 } },
    { test: ['generator'], params: { x: 1, y: 0 } },
    { test: ['generator'], params: { x: 1, y: 1 } },
    { test: ['generator'], params: { x: 2, y: 0 } },
    { test: ['generator'], params: { x: 2, y: 1 } },
  ]);
});
