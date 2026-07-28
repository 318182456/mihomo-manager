import { useEffect, useState } from 'react';
import { KeyRound, Trash2, ShieldCheck } from 'lucide-react';
import * as api from '../api';
import { Page, PageHeader, EmptyState, LoadingState } from '../ui/Layout';
import { Button, IconButton } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { useDialog } from '../ui/Dialog';

export function PasskeysView() {
  const [keys, setKeys] = useState<api.PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const toast = useToast();
  const dialog = useDialog();

  const load = async () => {
    try {
      setKeys(await api.getPasskeyList());
    } catch (e) {
      toast.error('加载 Passkey 列表失败', e instanceof Error ? e.message : undefined);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleRegister = async () => {
    setRegistering(true);
    try {
      const name = await api.registerPasskey();
      toast.success(`已注册 ${name}`);
      load();
    } catch (e) {
      toast.error('注册失败', e instanceof Error ? e.message : undefined);
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (key: api.PasskeyItem) => {
    const confirmed = await dialog.confirm({
      title: `移除 ${key.name}？`,
      description: '移除后该设备将无法用于免密登录。若这是最后一个 Passkey，请确保仍记得管理密码。',
      confirmLabel: '移除',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await api.deletePasskey(key.id);
      toast.success('已移除');
      load();
    } catch (e) {
      toast.error('移除失败', e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Passkey"
        description="管理用于免密登录的设备凭据。"
        actions={
          <Button variant="primary" onClick={handleRegister} loading={registering}
                  icon={<KeyRound size={15} />}>
            注册新 Passkey
          </Button>
        }
      />

      <div className="card overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : keys.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck size={32} />}
            title="尚未注册 Passkey"
            description="注册后可使用指纹、面容或安全密钥登录，无需输入密码。"
            action={
              <Button variant="primary" onClick={handleRegister} loading={registering}
                      icon={<KeyRound size={15} />}>
                注册新 Passkey
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {keys.map(k => (
              <li key={k.id} className="flex items-center gap-4 px-5 py-4 group">
                <div className="w-9 h-9 rounded-[var(--radius-control)] bg-raised border border-line
                                flex items-center justify-center text-fg-muted shrink-0">
                  <KeyRound size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg">{k.name}</p>
                  <p className="text-xs text-fg-muted mt-0.5">
                    注册于 {new Date(k.createdAt).toLocaleString('zh-CN')}
                  </p>
                </div>
                {/* 触屏没有 hover，窄屏常显 */}
                <IconButton
                  label="移除"
                  icon={<Trash2 size={16} />}
                  onClick={() => handleDelete(k)}
                  className="md:opacity-0 md:group-hover:opacity-100
                             md:focus-visible:opacity-100 hover:text-danger"
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-5 mt-4">
        <h3 className="text-sm font-semibold text-fg mb-3">使用说明</h3>
        <ol className="space-y-2 text-sm text-fg-muted list-decimal list-inside marker:text-fg-subtle">
          <li>使用管理密码登录后，在本页点击「注册新 Passkey」。</li>
          <li>浏览器会调起系统对话框，选择指纹、面容或安全密钥完成注册。</li>
          <li>下次登录时会优先显示 Passkey 入口，密码登录仍作为备用方式保留。</li>
        </ol>
      </div>
    </Page>
  );
}
