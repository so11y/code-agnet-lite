import {compact} from 'lodash-es';
import {formatOperationSection, formatVerifyFailureBlock, joinSections} from '@code-agent-lite/shared';
import type {TurnOperations, TurnRecord, VerifyGate} from '../session-types.js';
import {formatUserRequest} from '../prompt.js';
import type {VerifyResult} from './types.js';

export function formatTurnRecordForGate(record: TurnRecord): string {
  return joinSections(
    formatUserRequest(record.userInput),
    formatOperationSection('write_file 写入的文件：', record.operations.writtenFiles),
    formatOperationSection('delete_file 删除的文件：', record.operations.deletedFiles),
    formatOperationSection('run_cmd 执行的命令：', record.operations.executedCommands),
    `Agent 最终回答：\n${record.assistantText || '（无文本回答）'}`
  );
}

export function fallbackVerifyGate(record: TurnRecord): VerifyGate {
  if (record.operations.writtenFiles.length > 0) {
    return {
      shouldVerify: true,
      reason: `本轮写入了 ${record.operations.writtenFiles.length} 个文件（${record.operations.writtenFiles.join('、')}）`
    };
  }

  if (record.operations.deletedFiles.length > 0) {
    return {
      shouldVerify: true,
      reason: `本轮删除了 ${record.operations.deletedFiles.length} 个文件（${record.operations.deletedFiles.join('、')}）`
    };
  }

  return {
    shouldVerify: false,
    reason: '未检测到文件变更，默认跳过自动验证'
  };
}

export function formatVerifyFailure(failures: VerifyResult[], round: number): string {
  const blocks = failures.map((failure) => formatVerifyFailureBlock(failure));

  return joinSections(
    `自动验证失败（第 ${round} 轮修复）。请根据以下输出修复代码。`,
    '修复完成后不要声称任务已完成，系统会再次自动验证。',
    ...blocks
  );
}

function inferFailureReasons(failures: VerifyResult[]): string[] {
  const combined = failures.map((failure) => failure.output).join('\n');

  const reasons = compact([
    /TS\d{4}/.test(combined) && '存在 TypeScript 类型错误，自动修复未能完全消除',
    /FAIL|AssertionError|Expected|received/i.test(combined) && '单元测试断言失败，逻辑或边界条件仍有问题',
    /MODULE_NOT_FOUND|Cannot find module/i.test(combined) && '缺少依赖或模块路径错误，可能需要先安装依赖',
    /ENOENT|EACCES/i.test(combined) && '文件或权限问题，可能与工作区路径有关'
  ]);

  return reasons.length > 0 ? reasons : ['验证命令返回非零退出码，请查看上方具体错误输出'];
}

export function buildFinalFailureReport(options: {
  failures: VerifyResult[];
  fixRounds: number;
  replans: number;
  operations: TurnOperations;
  gate: VerifyGate;
}): string {
  const {failures, fixRounds, replans, operations, gate} = options;

  const failureBlocks = failures.map((failure) =>
    formatVerifyFailureBlock(failure, {style: 'bullet', maxOutputLen: 2000})
  );

  const reasons = inferFailureReasons(failures);

  return [
    '## 验证未通过，自动修复已停止',
    '',
    `触发原因：${gate.reason}`,
    '',
    `已尝试：**${fixRounds} 轮**自动修复${replans > 0 ? ` + **${replans} 次**换思路` : ''}，仍无法通过验证。`,
    '',
    '### 失败命令',
    ...failureBlocks,
    '',
    '### 可能原因',
    ...reasons.map((reason) => `- ${reason}`),
    '',
    operations.writtenFiles.length > 0
      ? `### 本轮已写入文件\n${operations.writtenFiles.map((file) => `- ${file}`).join('\n')}`
      : '',
    operations.deletedFiles.length > 0
      ? `### 本轮已删除文件\n${operations.deletedFiles.map((file) => `- ${file}`).join('\n')}`
      : '',
    operations.writtenFiles.length === 0 && operations.deletedFiles.length === 0
      ? '### 本轮文件变更\n（未检测到 write_file / delete_file 调用）'
      : '',
    '',
    '### 建议下一步',
    '- 根据上方错误手动修复后，重新发起请求',
    '- 或在终端手动运行失败命令查看完整输出'
  ].join('\n');
}
