"""运行编译产物的真实PTY局部链路；只使用配置中明确选择的faux模型。"""
import fcntl
import json
import os
from pathlib import Path
import pty
import secrets
import select
import signal
import struct
import subprocess
import termios
import time

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / '.artifacts/verification/kernel-tui-pty' / time.strftime('%Y%m%d-%H%M%S')
EVIDENCE.mkdir(parents=True, mode=0o700)
env = {key: value for key, value in os.environ.items() if key in ('PATH', 'HOME', 'TMPDIR', 'LANG')}
env.update(TERM='xterm-256color', PI_OFFLINE='1', LAWCLAW_CHAIN_TOKEN=secrets.token_hex(24),
           LAWCLAW_CHAIN_EVIDENCE=str(EVIDENCE))
runner = str(ROOT / 'scripts/kernel-tui-local-chain.mjs')
service = None
terminal = None
master = None
slave = None
output = bytearray()


def records(role):
    file = EVIDENCE / f'{role}.jsonl'
    return [json.loads(line) for line in file.read_text().splitlines()] if file.exists() else []


def wait_until(predicate, seconds=20):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if master is not None and select.select([master], [], [], 0.05)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError:
                pass
        else:
            time.sleep(0.02)
        if predicate():
            return
        if service is not None and service.poll() is not None:
            raise AssertionError(f'service exited {service.returncode}')
        if terminal is not None and terminal.poll() is not None:
            raise AssertionError(f'terminal exited {terminal.returncode}')
    raise AssertionError('等待链路屏障超时')


try:
    # 必须先成功构建当前源码，不能用旧产物或失败构建的部分产物验收。
    subprocess.run(['npm', 'run', 'build', '--workspace=@earendil-works/pi-tui'],
                   cwd=ROOT.parent.parent, env=env, check=True, timeout=60)
    subprocess.run(['npm', 'run', 'build', '--workspace=lawclaw-agent-kernel'],
                   cwd=ROOT.parent.parent, env=env, check=True, timeout=60)
    with (EVIDENCE / 'service.log').open('wb') as log:
        service = subprocess.Popen(['node', runner, 'service'], cwd=ROOT, env=env, stdout=log, stderr=log)
    wait_until(lambda: (EVIDENCE / 'endpoint.json').exists())
    env['LAWCLAW_CHAIN_ENDPOINT'] = json.loads((EVIDENCE / 'endpoint.json').read_text())['endpoint']
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 120, 0, 0))
    terminal = subprocess.Popen(['node', runner, 'terminal'], cwd=ROOT, env=env,
                                stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    wait_until(lambda: any(row['type'] == 'terminalReady' for row in records('terminal')))
    goal = '请检查工作区并给出中文结果'
    os.write(master, goal.encode())
    wait_until(lambda: any(row['type'] == 'draftEdited' and row['text'] == goal for row in records('terminal')))
    os.write(master, b'\r')
    wait_until(lambda: any(row['type'] == 'displayed' for row in records('terminal')))
    wait_until(lambda: '均已贯通' in output.decode(errors='replace'))
    server_records = records('service')
    submitted = [row for row in server_records if row['type'] == 'submitted']
    completed = [row for row in server_records if row['type'] == 'kernelCompleted']
    assert len(submitted) == len(completed) == 1
    assert submitted[0]['goal'] == goal
    assert completed[0]['status'] == 'COMPLETED'
    assert completed[0]['turns'] == 3 and completed[0]['toolCalls'] == 2
    assert any(row['type'] == 'sseReceived' for row in records('terminal'))
    assert 'ToolCompleted' in completed[0]['events'] and 'ChildRunCompleted' in completed[0]['events']
    # 真实终端缩窄后，控制命令仍必须通过已编译parseTuiInput。
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 16, 29, 0, 0))
    terminal.send_signal(signal.SIGWINCH)
    os.write(master, b'/quit')
    wait_until(lambda: any(row['type'] == 'draftEdited' and row['text'] == '/quit' for row in records('terminal')))
    os.write(master, b'\r')
    wait_until(lambda: any(row['type'] == 'closed' for row in records('terminal')))
    terminal.wait(timeout=10)
    assert terminal.returncode == 0
    closed = [row for row in records('terminal') if row['type'] == 'closed']
    assert closed and closed[-1]['raw'] is False
    assert any(row['type'] == 'input' and row['kind'] == 'command' and row['columns'] == 29 for row in records('terminal'))
    assert service.poll() is None, '退出TUI不能关闭独立服务进程'
    report = {'status': 'passed', 'chain': 'PTY → compiled Pi TUI/EditorAdapter → HTTP/SSE → compiled AgentSystem/RunFlow → configured Faux Pi Adapter → tools/delegation → RunObservation → terminal',
              'compiled': True, 'kernelTurns': completed[0]['turns'], 'toolCalls': completed[0]['toolCalls'],
              'narrowExitColumns': 29, 'terminalRestored': True, 'serviceSurvivedClientExit': True,
              'notVerified': ['production KernelHost protocol', 'durable admission', 'session history adoption',
                              'model text streaming', 'host restart', 'real model']}
    (EVIDENCE / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'status': 'passed', 'evidence': str(EVIDENCE)}, ensure_ascii=False))
finally:
    (EVIDENCE / 'terminal.raw').write_bytes(output)
    for process in (terminal, service):
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    for descriptor in (master, slave):
        if descriptor is not None:
            os.close(descriptor)
