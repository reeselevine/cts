export const description = `Validation tests for blankspace handling`;

import { makeTestGroup } from '../../../../common/framework/test_group.js';
import { ShaderValidationTest } from '../shader_validation_test.js';

export const g = makeTestGroup(ShaderValidationTest);

g.test('null_characters')
  .desc(`Test that WGSL source containing a null character is rejected.`)
  .params(u =>
    u
      .combine('contains_null', [true, false])
      .combine('placement', ['comment', 'delimiter', 'eol'])
      .beginSubcases()
  )
  .fn(t => {
    let code = '';
    if (t.params.placement === 'comment') {
      code = `// Here is a ${t.params.contains_null ? '\0' : 'Z'} character`;
    } else if (t.params.placement === 'delimiter') {
      code = `let${t.params.contains_null ? '\0' : ' '}name : i32 = 0;`;
    } else if (t.params.placement === 'eol') {
      code = `let name : i32 = 0;${t.params.contains_null ? '\0' : ''}`;
    }
    t.expectCompileResult(!t.params.contains_null, code);
  });

g.test('blankspace')
  .desc(`Test that all blankspace characters act as delimiters.`)
  .params(u =>
    u
      .combine('blankspace', [
        ['\u0020', 'space'],
        ['\u0009', 'horizontal_tab'],
        ['\u000a', 'line_feed'],
        ['\u000b', 'vertical_tab'],
        ['\u000c', 'form_feed'],
        ['\u000d', 'carriage_return'],
        ['\u0085', 'next_line'],
        ['\u200e', 'left_to_right_mark'],
        ['\u200f', 'right_to_left_mark'],
        ['\u2028', 'line_separator'],
        ['\u2029', 'paragraph_separator'],
      ])
      .beginSubcases()
  )
  .fn(t => {
    const code = `let${t.params.blankspace[0]}ident : i32 = 0;`;
    t.expectCompileResult(true, code);
  });
