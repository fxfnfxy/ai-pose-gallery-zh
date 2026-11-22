import { createFileRoute } from '@tanstack/react-router'
import { Section } from '@/components/common/FormSection'
import { PageHeader } from '@/components/common/PageHeader'
import { Badge } from '@/components/ui/badge'

export const Route = createFileRoute('/guide')({
  staticData: { title: '使用指南与免责声明' },
  component: GuidePage,
})

function GuidePage() {
  return (
    <>
      <PageHeader title="使用指南与免责声明" />

      <Section title="角色合成流程" className="@lg/section:grid-cols-3">
        <div className="rounded-2xl bg-background p-4">
          <Badge>1. 人像</Badge>
          <h3 className="mt-2 text-sm font-semibold">人像颜值库 (1,499)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            挑选五官与发型参考，或在合成台直接上传自定义人像图，锁定角色面部特征。
          </p>
        </div>

        <div className="rounded-2xl bg-background p-4">
          <Badge>2. 服装</Badge>
          <h3 className="mt-2 text-sm font-semibold">服装穿搭库 (3,224)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            按全部 / 现实 / 二次元及来源、分类、标签挑选；含ギア写实 1,407 套、Shisei 中国历代 57 套（227 视角）、ギア动漫 1,320 套与 CharaDB 二次元 440 套。
          </p>
        </div>

        <div className="rounded-2xl bg-background p-4">
          <Badge>3. 姿势 + 附图</Badge>
          <h3 className="mt-2 text-sm font-semibold">动作姿势库 (1,439)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            挑选 5 视角 3D 素体白模或深度图（Depth），结合云端 API 或本地 ComfyUI 一键生成角色立绘。
          </p>
        </div>
      </Section>

      <Section
        title="API 接口配置说明（必读）"
        desc="本站不内置任何公共 API Key，生成能力由使用者自己的模型账号提供；配置只写在你自己的浏览器里，不会上传到本站服务器。"
        className="@lg/section:grid-cols-1"
      >
        <div className="space-y-3.5 rounded-2xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
          <div>
            <p className="font-semibold text-foreground">一、四步完成配置</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>打开左侧「设置」，在服务商标签（Gemini / GPT Image / Qwen / Doubao / PixAI / ComfyUI）中选定要用的那一个。</li>
              <li>填写 <code className="rounded bg-muted px-1">Base URL</code>：留空即使用下表默认地址，也可填你自己的中转地址。</li>
              <li>粘贴你自己的 <code className="rounded bg-muted px-1">API Key</code>；ComfyUI 为本地服务，Key 可留空。</li>
              <li>选择「默认模型 ID」（列表中没有就选「自定义模型 ID」手填），点「保存配置」，回到合成台即可生成。</li>
            </ol>
          </div>

          <div>
            <p className="font-semibold text-foreground">二、各服务商默认参数</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border/60 text-foreground">
                    <th className="py-1.5 pr-3 font-medium">服务商</th>
                    <th className="py-1.5 pr-3 font-medium">默认 Base URL</th>
                    <th className="py-1.5 pr-3 font-medium">常用模型 ID</th>
                    <th className="py-1.5 font-medium">说明</th>
                  </tr>
                </thead>
                <tbody className="align-top">
                  <tr className="border-b border-border/40">
                    <td className="py-1.5 pr-3">Google Gemini</td>
                    <td className="py-1.5 pr-3"><code>https://generativelanguage.googleapis.com</code></td>
                    <td className="py-1.5 pr-3">gemini-3.1-flash-image-preview<br />gemini-2.5-flash-image</td>
                    <td className="py-1.5">浏览器直连，需在 Google AI Studio 开通并获取 Key</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-1.5 pr-3">OpenAI GPT Image</td>
                    <td className="py-1.5 pr-3"><code>https://api.openai.com/v1</code></td>
                    <td className="py-1.5 pr-3">gpt-image-2.5<br />gpt-image-1</td>
                    <td className="py-1.5">浏览器直连，账号需完成组织验证才有生图权限</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-1.5 pr-3">阿里云百炼 Qwen</td>
                    <td className="py-1.5 pr-3"><code>https://dashscope.aliyuncs.com</code></td>
                    <td className="py-1.5 pr-3">qwen-image-3.0-pro<br />qwen-image-edit-plus</td>
                    <td className="py-1.5">官方接口存在跨域限制，通常需要同源代理（见第四节）</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-1.5 pr-3">字节火山方舟 Doubao</td>
                    <td className="py-1.5 pr-3"><code>https://ark.cn-beijing.volces.com</code></td>
                    <td className="py-1.5 pr-3">doubao-seedream-5-0<br />doubao-seededit-3-0-i2i</td>
                    <td className="py-1.5">同上；也可直接填推理接入点 ID（<code>ep-2026xxxx</code>）</td>
                  </tr>
                  <tr className="border-b border-border/40">
                    <td className="py-1.5 pr-3">PixAI</td>
                    <td className="py-1.5 pr-3"><code>https://api.pixai.art</code></td>
                    <td className="py-1.5 pr-3">Tsubaki.3<br />Tsubaki.3 Flash</td>
                    <td className="py-1.5">强制经过 <code>/api/proxy</code>，本站部署未提供该端点，暂不可用</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3">ComfyUI（本地）</td>
                    <td className="py-1.5 pr-3"><code>http://127.0.0.1:8188</code></td>
                    <td className="py-1.5 pr-3">由工作流决定</td>
                    <td className="py-1.5">需以 <code>--enable-cors-header</code> 启动，并允许本站来源</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <p className="font-semibold text-foreground">三、配置只存在你的浏览器里（不上云的实现方式）</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                <strong className="text-foreground">唯一存放位置：</strong>
                浏览器本地的 <code className="rounded bg-muted px-1">localStorage</code>，键名 <code className="rounded bg-muted px-1">pose_atlas_api_config_v3</code>。它不会进入 Cookie、不会随请求发送，也不会同步到任何服务器。
              </li>
              <li>
                <strong className="text-foreground">本站没有可存配置的地方：</strong>
                本站无账号体系、无登录、无用户表、无数据库，服务端根本不存在「用户配置」这张表或这个字段。
              </li>
              <li>
                <strong className="text-foreground">请求不经过本站：</strong>
                生成时由你的浏览器直接向服务商官方域名发起请求，本站服务器不参与转发、不接触你的 Key。
              </li>
              <li>
                <strong className="text-foreground">历史记录也去密钥：</strong>
                本地历史快照在保存前会显式剔除整个 <code className="rounded bg-muted px-1">providers</code> 字段（含 Key 与 Base URL），只保留模型名。
              </li>
              <li>
                <strong className="text-foreground">唯一的服务端接口只收图片：</strong>
                本站后端仅有 <code className="rounded bg-muted px-1">/api/save</code>（生成图归档）与 <code className="rounded bg-muted px-1">/api/health</code>（健康检查），前者只接收图片字节，不接收、不返回任何配置字段。
              </li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-foreground">四、不同用户之间的隔离机制</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5">
              <li>
                <strong className="text-foreground">没有共享存储，就没有可被读取的对方配置。</strong>
                配置只落在各自的浏览器，服务端不存副本，因此不存在「一个用户读到另一个用户 Key」的数据通路。
              </li>
              <li>
                <strong className="text-foreground">按浏览器来源天然分区。</strong>
                浏览器对 localStorage 的隔离边界是「协议 + 域名 + 端口」（同源策略），再叠加操作系统账户与浏览器配置文件。A 的存储区里没有 B 的键；同一台电脑换浏览器、换系统账户、开无痕窗口，读到的都是空白配置。
              </li>
              <li>
                <strong className="text-foreground">凭据由各自浏览器随身携带。</strong>
                每次生成都是「哪个浏览器发起，就用那个浏览器里保存的 Key」，服务端不代持、不缓存、不复用任何人的凭据，因此无法出现借用他人接口的情况。
              </li>
              <li>
                <strong className="text-foreground">没有回显与枚举通道。</strong>
                本站没有「读取配置」类接口，也没有任何返回 Key 的响应；即便知道他人 Key 的前几位，也无法通过本站查询、遍历或复用。
              </li>
            </ol>
          </div>

          <div>
            <p className="font-semibold text-foreground">五、你可以自行验证</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>开一个无痕窗口打开本站 →「设置」里所有 Key 均为空，默认模型回到初始值。</li>
              <li>换一个浏览器（或换一台设备）打开 → 同样是空配置，不会带出你在别处填过的内容。</li>
              <li>清除该站点的浏览器数据后刷新 → 配置消失，需重新填写；说明数据始终由你本地掌握。</li>
            </ul>
          </div>

          <div>
            <p className="font-semibold text-foreground">六、风险提示</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                公共电脑或共享设备上不要保存 Key；用完请在浏览器「站点设置」中清除本站数据（页面未提供一键清除按钮）。
              </li>
              <li>
                「服务端 CORS 代理（<code className="rounded bg-muted px-1">/api/proxy</code>）」请保持关闭使用浏览器直连：该项目上游实现是 Cloudflare Pages Function，本站部署未提供该端点（访问返回 404）。仅当你遇到跨域报错且自行搭建了可信代理时才可开启——此时 Key 会经过该代理，请务必确认其不记录请求内容。
              </li>
              <li>
                PixAI 强制依赖上述代理，因此在当前部署下不可用；如需使用请自行部署带 <code className="rounded bg-muted px-1">/api/proxy</code> 的环境。
              </li>
              <li>
                现实中 Key 泄露的唯一途径是本地环境本身：他人直接使用你的浏览器、读取浏览器数据的恶意扩展、或在不可信设备上填写。请定期在服务商后台轮换 Key。
              </li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="免责声明与合规使用规范（必读）" className="@lg/section:grid-cols-1">
        <div className="space-y-2.5 rounded-2xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">1. 仅供学习与合法艺术创作（严禁违法）：</strong>
            本项目（含网页工作台、本地 ComfyUI 插件与工作流模板）
            <strong className="text-foreground">仅供个人学习、人体结构研究、插画构图参考与技术交流使用</strong>
            。严禁使用本工具生成、制作或传播任何违反法律法规、淫秽色情、暴力违禁内容，严禁未经他人明确授权上传真实人物照片进行换脸或深伪合成（Deepfake）等侵犯他人肖像权、隐私权与名誉权的行为。
          </p>
          <p>
            <strong className="text-foreground">2. NSFW（18+）敏感内容提示：</strong>
            图库中包含部分成人向 3D 素体姿势（全身单人・性感系、双人缠绵）与内衣/性感穿搭参考，旨在服务绘画与动作设计练习。系统默认开启「安全模式 (SFW)」屏蔽上述分类，
            <strong className="text-rose-600 dark:text-rose-400">未满 18 周岁的未成年人严禁关闭安全模式或访问相关内容</strong>。
          </p>
          <p>
            <strong className="text-foreground">3. 隐私保护与使用者责任归属：</strong>
            本工作台为纯前端应用，<strong className="text-foreground">使用者配置的 API Key 仅保存在本机浏览器，不会上传、不被打包、不被服务端留存</strong>；所有 AI 生图请求均由浏览器直连使用者自己的服务商账号或本机 ComfyUI 执行，平台不接收、不转发任何密钥或配置信息。需要特别说明：<strong className="text-foreground">生成的图片在浏览器内正常展示的同时，会默认额外归档一份到本站部署者自有的 NAS 存储</strong>（该归档只接收图片文件本身，不含账号、密钥等任何配置信息，也未对公网开放检索）。若你不希望生成结果被归档，请勿使用本站。
            <strong className="text-foreground">因使用者违规使用或不当传播所产生的一切法律责任，均由使用者本人独立承担，与本项目及维护者无关。</strong>
          </p>
        </div>
      </Section>

      <Section title="数据来源与版权说明" className="@lg/section:grid-cols-1">
        <div className="space-y-2.5 rounded-2xl bg-background p-4 text-xs leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">• 原作者版权归属：</strong>
            本仓库原有姿势（<code>ai-pose-gallery.pages.dev</code>、<code>ai-pose-depth-gallery.pages.dev</code>）、现实服装（<code>ai-costume-gallery.pages.dev</code>）、人像（<code>ai-portrait-gallery.pages.dev</code>）参考图与原始元数据源自原作者{' '}
            <strong className="text-foreground">ギア（@giaaibusi）</strong> 公开站点，著作权归原作者所有。本仓库仅为中文本地化翻译整理与前端工程学习存档，不对原始图片主张任何所有权。
          </p>
          <p>
            <strong className="text-foreground">• 二次元服装来源：</strong>
            440 套二次元服装源自 <a className="underline hover:text-foreground" href="https://charadb-2fi.pages.dev/" target="_blank" rel="noopener noreferrer">たき AI · CharaDB</a>（标签与名称遵循 CC0，图片从原站在线加载，仅供学习与生图参考，禁止用于真人/未成年人或将原图二次分发，详见 <a className="underline hover:text-foreground" href="https://github.com/taki-ttt/charadb/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">原作者说明</a>）。
          </p>
          <p>
            <strong className="text-foreground">• 使用与分发限制：</strong>
            人像库遵循 <strong className="text-emerald-600 dark:text-emerald-400">CC0 1.0 协议</strong>；原有姿势库与现实服装库免费供个人学习与 AI 生图参考使用，
            <strong className="text-foreground">严禁将本图库原始图片打包转售或用于付费分发</strong>。
          </p>
        </div>
      </Section>
    </>
  )
}
