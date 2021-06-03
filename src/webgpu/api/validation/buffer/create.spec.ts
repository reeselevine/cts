export const description = `
Tests for validation in createBuffer.
`;

import { pbool, poptions } from '../../../../common/framework/params_builder.js';
import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { assert } from '../../../../common/framework/util/util.js';
import { kBufferSizeAlignment } from '../../../capability_info.js';
import { ValidationTest } from '../validation_test.js';

export const g = makeTestGroup(ValidationTest);

assert(kBufferSizeAlignment === 4);
g.test('size')
  .desc('Test buffer size alignment.')
  .params2(u =>
    u
      .combine(pbool('mappedAtCreation'))
      .beginSubcases()
      .combine(
        poptions('size', [
          0,
          kBufferSizeAlignment * 0.5,
          kBufferSizeAlignment,
          kBufferSizeAlignment * 1.5,
          kBufferSizeAlignment * 2,
        ])
      )
  )
  .unimplemented();

g.test('usage')
  .desc('Test combinations of (one to two?) usage flags.')
  .params2(u =>
    u.beginSubcases().combine(pbool('mappedAtCreation')).combine(
      poptions('usage', [
        // TODO
      ])
    )
  )
  .unimplemented();
