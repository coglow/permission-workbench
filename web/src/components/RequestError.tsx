import { Alert, Button } from 'antd';

/** 页面加载失败共用错误文字和重试入口，业务内容仍由各页面渲染。 */
export function RequestError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert
      type="error"
      showIcon
      title={message}
      action={
        <Button size="small" onClick={onRetry}>
          重试
        </Button>
      }
    />
  );
}
