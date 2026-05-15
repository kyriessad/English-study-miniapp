# verify-before-commit

提交前检查。

## 执行步骤

1. 运行 git status --short。
2. 根据修改文件运行必要检查：
   - 前端 JS：node --check <changed-js-file>
   - 后端：python -m pytest tests/ -q
   - 所有仓库：git diff --check
3. 检查是否误改 project.private.config.json。
4. 检查是否包含未要求修改的业务文件。
5. 输出是否建议提交。
6. 给出建议 commit message。

## 输出格式

1. 当前仓库
2. 修改文件
3. staged / unstaged 状态
4. 检查命令结果
5. 是否存在 CRLF warning
6. 是否存在 whitespace error
7. 是否建议提交
8. 建议 commit message

## 规则

不要自动提交，除非用户明确说"提交"。
