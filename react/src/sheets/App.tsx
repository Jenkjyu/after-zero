// 常驻挂载的第5个React入口——不属于任何tab，服务的是"在还债务"/"还款日"两棵独立React树
// 共用的sheet。DetailSheet(第五步)+EditSheet(第六步)都挂在这一层，不需要为editSheet
// 再新开一个入口。
import { DetailSheet } from "./DetailSheet";
import { EditSheet } from "./EditSheet";

export function App() {
  return (
    <>
      <DetailSheet />
      <EditSheet />
    </>
  );
}
