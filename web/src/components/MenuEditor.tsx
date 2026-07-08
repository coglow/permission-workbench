import { Alert, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import { createMenu, updateMenu } from '../api';
import { PERMISSION_CATALOG } from '../../../shared/catalog.ts';
import type {
  EnabledStatus,
  MenuCatalog,
  MenuInput,
  MenuNode,
  PageKey,
} from '../../../shared/contracts.ts';
import { useMutation } from '../useMutation';

interface MenuFormValues {
  parentId?: string | null;
  title: string;
  nodeType: 'group' | 'page';
  component?: PageKey;
  sortOrder: number;
  status: EnabledStatus;
}

/** 页面选择只决定固定绑定，编辑器不提供路径或权限的自由输入。 */
export function MenuEditor({
  menu,
  pages,
  flatMenus,
  onCancel,
  onSaved,
}: {
  menu?: MenuNode;
  pages: MenuCatalog['pages'];
  flatMenus: MenuNode[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form] = Form.useForm<MenuFormValues>();
  const isPage = Form.useWatch('nodeType', form) === 'page';
  const selectedComponent = Form.useWatch('component', form);
  const selectedPage = pages.find((page) => page.component === selectedComponent);
  const mutation = useMutation('菜单保存失败');
  const bound = new Set(
    flatMenus
      .filter((node) => node.id !== menu?.id && node.component !== null)
      .map((node) => node.component),
  );

  async function handleSubmit(values: MenuFormValues) {
    const input: MenuInput = {
      parentId: values.parentId ?? null,
      title: values.title,
      component: values.nodeType === 'page' ? (values.component ?? null) : null,
      sortOrder: values.sortOrder,
    };
    const saved = await mutation.run(() =>
      menu ? updateMenu(menu.id, { ...input, status: values.status }) : createMenu(input),
    );
    if (saved) await onSaved();
  }

  return (
    <Modal
      title={menu ? `编辑菜单：${menu.title}` : '新增菜单'}
      open
      width={640}
      confirmLoading={mutation.pending}
      okText="保存"
      cancelText="取消"
      cancelButtonProps={{ disabled: mutation.pending }}
      closable={!mutation.pending}
      mask={{ closable: !mutation.pending }}
      keyboard={!mutation.pending}
      onOk={() => form.submit()}
      onCancel={onCancel}
    >
      {mutation.error && (
        <Alert className="form-error" type="error" showIcon title={mutation.error} />
      )}
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          parentId: menu?.parentId ?? null,
          title: menu?.title ?? '',
          nodeType: menu?.component ? 'page' : 'group',
          component: menu?.component ?? undefined,
          sortOrder: menu?.sortOrder ?? 10,
          status: menu?.status ?? 'enabled',
        }}
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          label="菜单名称"
          name="title"
          rules={[{ required: true, whitespace: true, message: '请输入菜单名称' }]}
        >
          <Input placeholder="请输入菜单名称" />
        </Form.Item>
        <Form.Item label="上级" name="parentId">
          <Select
            allowClear
            placeholder="不选表示根级"
            options={flatMenus
              .filter((node) => node.component === null && node.id !== menu?.id)
              .map((node) => ({ value: node.id, label: node.title }))}
          />
        </Form.Item>
        <Form.Item label="类型" name="nodeType">
          <Select
            options={[
              { value: 'group', label: '分组' },
              { value: 'page', label: '页面' },
            ]}
          />
        </Form.Item>
        {isPage && (
          <Form.Item
            label="页面"
            name="component"
            rules={[{ required: true, message: '请选择页面' }]}
          >
            <Select
              placeholder="请选择页面"
              options={pages.map((page) => ({
                value: page.component,
                label: `${page.name}${bound.has(page.component) ? '（已绑定菜单）' : ''}`,
                disabled: bound.has(page.component),
              }))}
            />
          </Form.Item>
        )}
        {isPage && selectedPage && (
          <Typography.Paragraph type="secondary">
            进入所需权限：
            {
              PERMISSION_CATALOG.find(
                (permission) => permission.code === selectedPage.permissionCode,
              )!.name
            }
            （由页面固定）
          </Typography.Paragraph>
        )}
        <Form.Item
          label="排序"
          name="sortOrder"
          rules={[{ required: true, message: '请输入排序（不小于 0 的整数）' }]}
        >
          <InputNumber min={0} precision={0} className="full-width" />
        </Form.Item>
        {menu && (
          <Form.Item label="状态" name="status">
            <Select
              options={[
                { value: 'enabled', label: '启用' },
                { value: 'disabled', label: '停用' },
              ]}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
}
