# small-hotfix

执行一个小型 hotfix。

## 规则

1. 先用 3-5 分钟只读定位根因。
2. 不要大范围重构。
3. 优先只改用户指定文件。
4. 不要修改 project.private.config.json。
5. 不要自动提交，除非用户明确要求。
6. 如果需要扩大修改范围，先说明原因，不要直接大改。
7. 不要顺手做下一阶段功能。

## 输出格式

完成后输出：

1. 根因
2. 修改文件
3. 修改点
4. 是否越过边界
5. 是否修改了不该修改的模块
6. 验证命令结果
7. git status --short

## 常用验证

前端 JS：

```bash
node --check <changed-js-file>
git diff --check
git status --short
```

后端 Python：

```bash
python -m pytest tests/ -q
git diff --check
git status --short
```
