import { Form, Input, Select } from 'antd';
import { PROJECT_STATUSES, type ProjectInput } from '../api';

export function ProjectFormFields() {
  return (
    <>
      <Form.Item
        label="项目名称"
        name="name"
        rules={[{ required: true, whitespace: true, message: '请输入项目名称' }]}
      >
        <Input placeholder="请输入项目名称" />
      </Form.Item>

      <Form.Item
        label="项目状态"
        name="status"
        rules={[{ required: true, message: '请选择项目状态' }]}
      >
        <Select options={PROJECT_STATUSES.map((status) => ({ value: status, label: status }))} />
      </Form.Item>

      <Form.Item label="项目描述" name="description">
        <Input.TextArea rows={3} placeholder="选填" />
      </Form.Item>
    </>
  );
}

/** 表单初始值：新建时状态默认“规划中”，描述留空。 */
export const PROJECT_FORM_DEFAULTS: ProjectInput = {
  name: '',
  status: PROJECT_STATUSES[0],
  description: '',
};
