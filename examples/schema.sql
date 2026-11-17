-- TaskFlow 示例库表
-- 约定：-- @domain 域 [#色值] 分组；-- 行尾注释 = 列说明；ts: Name = jsonb 的 TS 类型

/* @ts
type ActivityPayload = {
  /** 操作类型 */
  action: "created" | "updated" | "deleted" | "status_changed" | "assigned";
  /** 变更前的字段快照 */
  before?: Record<string, unknown>;
  /** 变更后的字段快照 */
  after?: Record<string, unknown>;
};
*/

-- @domain 用户与组织 #5f83b4

-- 平台用户账号
CREATE TABLE users (
  id          uuid PRIMARY KEY,                    -- 主键
  email       varchar(255) NOT NULL UNIQUE,        -- 登录邮箱
  name        varchar(80) NOT NULL,                -- 显示名称
  avatar_url  text,                                -- 头像地址
  timezone    varchar(40) NOT NULL DEFAULT 'UTC',  -- 时区
  created_at  timestamptz NOT NULL,                -- 注册时间
  updated_at  timestamptz NOT NULL                 -- 资料更新时间
);

-- 工作区（租户隔离的顶层边界）
CREATE TABLE workspaces (
  id         uuid PRIMARY KEY,                     -- 主键
  slug       varchar(60) NOT NULL UNIQUE,          -- URL 短标识
  name       varchar(120) NOT NULL,                -- 工作区名称
  plan       varchar(20) NOT NULL DEFAULT 'free',  -- 套餐：free / pro / enterprise
  owner_id   uuid NOT NULL REFERENCES users(id),   -- 创建者
  created_at timestamptz NOT NULL                  -- 创建时间
);
CREATE INDEX idx_workspaces_owner ON workspaces (owner_id);

-- @kind assoc
-- 工作区成员（复合主键）；role / joined_at 是关系上的属性
CREATE TABLE workspace_members (
  workspace_id uuid REFERENCES workspaces(id),     -- 工作区
  user_id      uuid REFERENCES users(id),          -- 成员
  role         varchar(20) NOT NULL DEFAULT 'member',  -- 角色：owner / admin / member
  joined_at    timestamptz NOT NULL,               -- 加入时间
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_wm_user ON workspace_members (user_id);

-- @domain 项目 #b08850

-- 工作区下的项目
CREATE TABLE projects (
  id           uuid PRIMARY KEY,                     -- 主键
  workspace_id uuid NOT NULL REFERENCES workspaces(id),  -- 所属工作区
  key          varchar(10) NOT NULL,                 -- 项目缩写，如 TF
  name         varchar(120) NOT NULL,                -- 项目名称
  color        varchar(9),                           -- 主题色 #hex
  status       varchar(20) NOT NULL DEFAULT 'active',  -- active / archived
  lead_id      uuid REFERENCES users(id),            -- 负责人，可空
  created_at   timestamptz NOT NULL,                 -- 创建时间
  archived_at  timestamptz                           -- 归档时间
);
CREATE UNIQUE INDEX uq_projects_ws_key ON projects (workspace_id, key);
CREATE INDEX idx_projects_ws ON projects (workspace_id, status);

-- 迭代 / 冲刺周期
CREATE TABLE sprints (
  id         uuid PRIMARY KEY,                       -- 主键
  project_id uuid NOT NULL REFERENCES projects(id),  -- 所属项目
  name       varchar(120) NOT NULL,                  -- 迭代名
  goal       text,                                   -- 迭代目标
  starts_on  date,                                   -- 开始日
  ends_on    date,                                   -- 结束日
  status     varchar(20) NOT NULL DEFAULT 'planned'  -- planned / active / closed
);
CREATE INDEX idx_sprints_project ON sprints (project_id, status);

-- @domain 任务 #5f9e83

-- 任务主表，支持父子层级
CREATE TABLE tasks (
  id          uuid PRIMARY KEY,                        -- 主键
  project_id  uuid NOT NULL REFERENCES projects(id),   -- 所属项目
  sprint_id   uuid REFERENCES sprints(id),             -- 所在迭代，可空
  parent_id   uuid REFERENCES tasks(id),               -- 父任务（子任务层级）
  title       varchar(200) NOT NULL,                   -- 标题
  description text,                                    -- 详情，Markdown
  status      varchar(20) NOT NULL DEFAULT 'todo',     -- todo / in_progress / done
  priority    varchar(10) NOT NULL DEFAULT 'medium',   -- low / medium / high / urgent
  position    double precision NOT NULL,               -- 看板排序值
  due_date    date,                                    -- 截止日期
  created_by  uuid NOT NULL REFERENCES users(id),      -- 创建人
  created_at  timestamptz NOT NULL,                    -- 创建时间
  updated_at  timestamptz NOT NULL                     -- 更新时间
);
CREATE INDEX idx_tasks_project ON tasks (project_id, status);
CREATE INDEX idx_tasks_sprint  ON tasks (sprint_id);
CREATE INDEX idx_tasks_parent  ON tasks (parent_id);
CREATE INDEX idx_tasks_due     ON tasks (due_date);

-- 任务指派人（复合主键）
CREATE TABLE task_assignees (
  task_id     uuid REFERENCES tasks(id),   -- 任务
  user_id     uuid REFERENCES users(id),   -- 被指派人
  assigned_by uuid REFERENCES users(id),   -- 操作人
  assigned_at timestamptz NOT NULL,        -- 指派时间
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX idx_ta_user ON task_assignees (user_id);

-- 任务 ↔ 标签（复合主键）
CREATE TABLE task_tags (
  task_id uuid REFERENCES tasks(id),   -- 任务
  tag_id  uuid REFERENCES tags(id),    -- 标签
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX idx_tt_tag ON task_tags (tag_id);

-- @domain 协作 #9b7bb8

-- 任务评论，支持回复
CREATE TABLE comments (
  id         uuid PRIMARY KEY,                     -- 主键
  task_id    uuid NOT NULL REFERENCES tasks(id),   -- 所属任务
  author_id  uuid NOT NULL REFERENCES users(id),   -- 作者
  parent_id  uuid REFERENCES comments(id),         -- 回复目标评论
  body       text NOT NULL,                        -- 正文，Markdown
  created_at timestamptz NOT NULL,                 -- 发表时间
  edited_at  timestamptz                           -- 最后编辑时间
);
CREATE INDEX idx_comments_task ON comments (task_id, created_at);

-- 任务附件
CREATE TABLE attachments (
  id          uuid PRIMARY KEY,                    -- 主键
  task_id     uuid NOT NULL REFERENCES tasks(id),  -- 所属任务
  uploader_id uuid NOT NULL REFERENCES users(id),  -- 上传人
  file_name   varchar(255) NOT NULL,               -- 原始文件名
  mime_type   varchar(120),                        -- MIME 类型
  size_bytes  bigint NOT NULL,                     -- 字节数
  storage_key text NOT NULL,                       -- 对象存储路径
  created_at  timestamptz NOT NULL                 -- 上传时间
);
CREATE INDEX idx_attach_task ON attachments (task_id);

-- 工作区级审计日志（COMMENT ON 写法等价于行尾注释，可混用）
CREATE TABLE activity_logs (
  id          bigint PRIMARY KEY,                  -- 主键，自增
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_id    uuid NOT NULL REFERENCES users(id),
  entity_type varchar(40) NOT NULL,
  entity_id   uuid NOT NULL,
  action      varchar(40) NOT NULL,
  payload     jsonb,
  created_at  timestamptz NOT NULL
);
COMMENT ON COLUMN activity_logs.workspace_id IS '所属工作区';
COMMENT ON COLUMN activity_logs.actor_id     IS '操作人';
COMMENT ON COLUMN activity_logs.entity_type  IS '对象类型：task / project …';
COMMENT ON COLUMN activity_logs.entity_id    IS '对象 ID';
COMMENT ON COLUMN activity_logs.action       IS '动作：created / updated …';
COMMENT ON COLUMN activity_logs.payload      IS 'ts: ActivityPayload 变更快照';
COMMENT ON COLUMN activity_logs.created_at   IS '发生时间';
CREATE INDEX idx_al_ws_time ON activity_logs (workspace_id, created_at);
CREATE INDEX idx_al_entity  ON activity_logs (entity_type, entity_id);

-- @domain 标签 #b87b7b

CREATE TABLE tags (
  id           uuid PRIMARY KEY,                     -- 主键
  workspace_id uuid NOT NULL REFERENCES workspaces(id),  -- 所属工作区
  name         varchar(40) NOT NULL,                 -- 标签名
  color        varchar(9)                            -- 颜色 #hex
);
COMMENT ON TABLE tags IS '工作区内的任务标签';
CREATE UNIQUE INDEX uq_tags_ws_name ON tags (workspace_id, name);
