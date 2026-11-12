# Test employees

The employees under `employees/` are made up for the tests of this repository and of
[hr-mcp](https://github.com/harnesy/hr-mcp), where they come from. They are not catalog employees and carry no text
from hr.harnsy.dev: this repository holds code only. They have the shapes the catalog has: no skills
(`harnsy/sample-plain`), skills (`harnsy/sample-skills`), skills with scripts and their licence
(`harnsy/sample-scripts`), and an employee of another publisher under CC0 (`octo/sample-guest`).

`golden/openclaw/` is what the renderer must write for each of them, byte for byte: the same trees hr-mcp renders for
its target `openclaw`. They are copied from hr-mcp, never regenerated here: a difference means the two renderers
disagree.
