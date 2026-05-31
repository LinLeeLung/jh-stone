<template>
  <section class="page-card">
    <div class="page-head">
      <h1>管理介面</h1>
    </div>

    <div v-if="loading" class="muted-text">讀取中…</div>

    <div v-else>
      <div v-if="!isAdmin">
        <p>您沒有權限存取此頁面。</p>
      </div>

      <div v-else>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th class="secondary-col">電郵</th>
                <th>角色</th>
                <th>預設視角</th>
                <th>部門</th>
                <th>預設部門</th>
                <th>動作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in users" :key="u.id">
                <td>
                  <input class="name-input" v-model="u.displayName" />
                </td>
                <td class="secondary-col">{{ u.email }}</td>
                <td>
                  <div class="role-checklist">
                    <label v-for="r in roles" :key="r" class="role-chip">
                      <input
                        type="checkbox"
                        :checked="u.roles.includes(r)"
                        @change="toggleUserRole(u, r, $event.target.checked)"
                      />
                      <span>{{ r }}</span>
                    </label>
                  </div>
                </td>
                <td>
                  <select v-model="u.activeRole" style="min-width: 110px">
                    <option v-for="r in u.roles" :key="r" :value="r">
                      {{ r }}
                    </option>
                  </select>
                </td>
                <td>
                  <div class="role-checklist">
                    <label v-for="d in deptOptions" :key="d.value" class="role-chip">
                      <input
                        type="checkbox"
                        :checked="u.departments.includes(d.value)"
                        @change="toggleUserDepartment(u, d.value, $event.target.checked)"
                      />
                      <span>{{ d.label }}</span>
                    </label>
                  </div>
                </td>
                <td>
                  <select v-model="u.activeDepartment" style="min-width: 110px">
                    <option value="">— 未設定</option>
                    <option v-for="d in u.departments" :key="d" :value="d">
                      {{ deptLabel(d) }}
                    </option>
                  </select>
                </td>
                <td>
                  <button
                    class="btn-manage"
                    @click="applyRole(u)"
                    :disabled="!changed(u)"
                  >
                    更新
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!--
          舊照片遷移工具：所有歷史 Storage 照片已遷移完成後隱藏。
          後端 callable function 仍保留，必要時可改為 v-if="true" 重新顯示。
        -->
        <template v-if="showLegacyMigration">
          <div class="toolbar-row" style="margin-top: 20px">
            <h2 style="margin: 0">舊照片遷移（Storage -> NAS）</h2>
            <button
              class="btn-aux"
              :disabled="migrationLoading || migrationPrecheckLoading"
              @click="runLegacyMigrationPrecheck"
            >
              {{ migrationPrecheckLoading ? "檢查中..." : "遷移前檢查" }}
            </button>
            <button
              class="btn-manage"
              :disabled="!canRunMigration"
              @click="runLegacyMigration"
            >
              {{ migrationLoading ? "執行中..." : "執行一批遷移" }}
            </button>
          </div>

          <div class="field-row" style="margin-top: 10px">
            <div class="field-item tight">
              <label>單一訂單（可留空）：</label>
              <input
                v-model.trim="migrationForm.orderId"
                placeholder="orderDocId"
              />
            </div>
            <div class="field-item tight">
              <label>本批筆數：</label>
              <input
                type="number"
                min="1"
                max="100"
                v-model.number="migrationForm.limit"
              />
            </div>
            <label style="display: flex; align-items: center; gap: 6px">
              <input
                type="checkbox"
                v-model="migrationForm.deleteStorageAfterSync"
                style="width: auto; height: auto"
              />
              遷移成功後刪除 Storage 舊檔
            </label>
          </div>

          <div
            v-if="migrationResult"
            class="summary-row"
            style="margin-top: 8px"
          >
            <span>掃描：{{ migrationResult.scanned || 0 }}</span>
            <span>成功：{{ migrationResult.migrated || 0 }}</span>
            <span>失敗：{{ migrationResult.failed || 0 }}</span>
            <span>略過：{{ migrationResult.skipped || 0 }}</span>
          </div>

          <div
            v-if="migrationPrecheckResult"
            class="summary-row"
            style="margin-top: 8px"
          >
            <span>檢查角色：{{ migrationPrecheckResult.role || "-" }}</span>
            <span>
              NAS 路徑：{{ migrationPrecheckResult.normalizedNasPath || "-" }}
            </span>
            <span>掃描：{{ migrationPrecheckResult.scanned || 0 }}</span>
            <span>候選：{{ migrationPrecheckResult.candidates || 0 }}</span>
          </div>

          <p v-if="!canRunMigration" class="muted-text" style="margin-top: 6px">
            需先完成遷移前檢查，且目前條件下有候選資料，才可執行遷移。
          </p>

          <div
            v-if="
              migrationResult &&
              Array.isArray(migrationResult.details) &&
              migrationResult.details.length
            "
            class="table-wrap"
            style="margin-top: 8px"
          >
            <table class="data-table">
              <thead>
                <tr>
                  <th>訂單</th>
                  <th>照片</th>
                  <th>結果</th>
                  <th class="secondary-col">說明</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(item, idx) in migrationResult.details"
                  :key="`${item.orderId || '-'}-${item.photoId || '-'}-${idx}`"
                >
                  <td>{{ item.orderId || "-" }}</td>
                  <td>{{ item.photoId || "-" }}</td>
                  <td>{{ item.status || "-" }}</td>
                  <td class="secondary-col">
                    {{ item.reason || item.nasPath || "-" }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <!-- 派車任務工具 -->
        <div class="toolbar-row" style="margin-top: 28px">
          <h2 style="margin: 0">派車任務工具</h2>
        </div>
        <div class="field-row" style="margin-top: 10px; gap: 12px; flex-wrap: wrap;">
          <button
            class="btn-aux"
            :disabled="dispatchTools.loading"
            @click="runBackfillOrders(true)"
            title="不寫入,只統計會建立/更新幾筆"
          >
            {{ dispatchTools.loading && dispatchTools.action === 'backfill-dry' ? '檢查中…' : '回填預覽 (dryRun)' }}
          </button>
          <button
            class="btn-manage"
            :disabled="dispatchTools.loading"
            @click="runBackfillOrders(false)"
          >
            {{ dispatchTools.loading && dispatchTools.action === 'backfill' ? '回填中…' : '執行回填 (Orders→salesOrders)' }}
          </button>
          <button
            class="btn-aux"
            :disabled="dispatchTools.loading"
            @click="runNightlySync(true)"
          >
            {{ dispatchTools.loading && dispatchTools.action === 'sync-dry' ? '檢查中…' : '夜班同步預覽 (dryRun)' }}
          </button>
          <button
            class="btn-manage"
            :disabled="dispatchTools.loading"
            @click="runNightlySync(false)"
          >
            {{ dispatchTools.loading && dispatchTools.action === 'sync' ? '同步中…' : '立即執行夜班同步' }}
          </button>
          <button
            class="btn-aux"
            :disabled="dispatchTools.loading"
            @click="runPurgeLegacy(true)"
            title="不實際刪除,只統計會刪掉幾筆"
          >
            {{ dispatchTools.loading && dispatchTools.action === 'purge-dry' ? '檢查中…' : '清除 legacy 鏡像 (dryRun)' }}
          </button>
          <button
            class="btn-manage"
            :disabled="dispatchTools.loading"
            style="background:#dc2626;color:#fff;"
            @click="runPurgeLegacy(false)"
          >
            {{ dispatchTools.loading && dispatchTools.action === 'purge' ? '刪除中…' : '危險: 刪除所有 legacy 鏡像' }}
          </button>
        </div>
        <div class="field-row" style="margin-top: 8px; gap: 12px;">
          <div class="field-item tight">
            <label>回填筆數上限:</label>
            <input type="number" min="1" max="5000" v-model.number="dispatchTools.backfillLimit" />
          </div>
          <div class="field-item tight">
            <label>夜班掃描未來天數:</label>
            <input type="number" min="1" max="30" v-model.number="dispatchTools.syncDaysAhead" />
          </div>
          <div class="field-item tight">
            <label title="勾選後會重寫已存在的鏡像並用來源日期覆寫 createdAt">
              <input type="checkbox" v-model="dispatchTools.forceCreatedAt" />
              強制覆寫 createdAt
            </label>
          </div>
        </div>
        <div style="margin-top: 14px; padding: 14px; background: #fff7ed; border: 1px solid #fdba74; border-radius: 8px; max-width: 780px">
          <h3 style="margin: 0 0 8px; font-size: 15px; color: #9a3412;">🧪 清除派車測試資料</h3>
          <p style="margin: 0 0 12px; font-size: 13px; color: #9a3412;">
            只刪除 <strong>PendingOrders</strong> 中含指定關鍵字的測試資料。員工查詢會直接讀這個集合，建議先用 dryRun 預覽再刪除。
          </p>
          <div class="field-row" style="gap: 12px; flex-wrap: wrap; align-items: end;">
            <div class="field-item tight">
              <label>測試關鍵字:</label>
              <input type="text" v-model.trim="dispatchTools.pendingCleanupKeyword" placeholder="例如：測試 / TEST" />
            </div>
            <div class="field-item tight">
              <label>掃描上限:</label>
              <input type="number" min="1" max="10000" v-model.number="dispatchTools.pendingCleanupLimit" />
            </div>
            <button
              class="btn-aux"
              :disabled="dispatchTools.loading"
              @click="runPendingCleanup(true)"
            >
              {{ dispatchTools.loading && dispatchTools.action === 'pending-cleanup-dry' ? '檢查中…' : '預覽 PendingOrders 測試資料' }}
            </button>
            <button
              class="btn-manage"
              style="background:#dc2626;color:#fff;"
              :disabled="dispatchTools.loading"
              @click="runPendingCleanup(false)"
            >
              {{ dispatchTools.loading && dispatchTools.action === 'pending-cleanup' ? '刪除中…' : '刪除 PendingOrders 測試資料' }}
            </button>
          </div>
        </div>
        <div style="margin-top: 14px; padding: 14px; background: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px; max-width: 780px">
          <h3 style="margin: 0 0 8px; font-size: 15px; color: #1d4ed8;">🧾 清除 Orders 測試派車資料</h3>
          <p style="margin: 0 0 12px; font-size: 13px; color: #1e40af;">
            只刪除 <strong>Orders</strong> 中含指定關鍵字的派車測試資料。若你的 Sheet trigger 是直接匯進 Orders，應該使用這組工具。
          </p>
          <div class="field-row" style="gap: 12px; flex-wrap: wrap; align-items: end;">
            <div class="field-item tight">
              <label>測試關鍵字:</label>
              <input type="text" v-model.trim="dispatchTools.ordersCleanupKeyword" placeholder="例如：測試 / TEST" />
            </div>
            <div class="field-item tight">
              <label>掃描上限:</label>
              <input type="number" min="1" max="10000" v-model.number="dispatchTools.ordersCleanupLimit" />
            </div>
            <button
              class="btn-aux"
              :disabled="dispatchTools.loading"
              @click="runOrdersCleanup(true)"
            >
              {{ dispatchTools.loading && dispatchTools.action === 'orders-cleanup-dry' ? '檢查中…' : '預覽 Orders 測試資料' }}
            </button>
            <button
              class="btn-manage"
              style="background:#dc2626;color:#fff;"
              :disabled="dispatchTools.loading"
              @click="runOrdersCleanup(false)"
            >
              {{ dispatchTools.loading && dispatchTools.action === 'orders-cleanup' ? '刪除中…' : '刪除 Orders 測試資料' }}
            </button>
          </div>
        </div>
        <div v-if="dispatchTools.error" class="muted-text" style="color: #dc2626; margin-top: 8px;">
          {{ dispatchTools.error }}
        </div>
        <div v-if="dispatchTools.result" class="summary-row" style="margin-top: 8px">
          <pre style="margin: 0; white-space: pre-wrap; font-size: 12px; max-height: 240px; overflow: auto;">{{ JSON.stringify(dispatchTools.result, null, 2) }}</pre>
        </div>

        <div class="toolbar-row" style="margin-top: 20px">
          <h2 style="margin: 0">上傳錯誤日誌</h2>
          <button class="btn-manage" @click="loadUploadErrorLogs">
            重新整理
          </button>
        </div>

        <div class="field-row" style="margin-top: 10px">
          <div class="field-item tight">
            <label>時間範圍：</label>
            <select v-model.number="logFilters.days">
              <option :value="1">近 1 天</option>
              <option :value="3">近 3 天</option>
              <option :value="7">近 7 天</option>
              <option :value="30">近 30 天</option>
            </select>
          </div>
          <div class="field-item tight">
            <label>動作：</label>
            <select v-model="logFilters.action">
              <option value="">全部</option>
              <option value="upload-photos">upload-photos</option>
              <option value="replace-photo">replace-photo</option>
              <option value="delete-photo">delete-photo</option>
              <option value="list-photos">list-photos</option>
            </select>
          </div>
          <div class="field-item">
            <label>關鍵字：</label>
            <input
              v-model.trim="logFilters.keyword"
              placeholder="code / 訂單號碼 / email / 檔名"
            />
          </div>
        </div>

        <div class="summary-row" style="margin-top: 8px">
          <span>符合筆數：{{ filteredUploadErrorLogs.length }}</span>
          <span>總筆數：{{ uploadErrorLogs.length }}</span>
        </div>

        <div v-if="logsLoading" class="muted-text">日誌讀取中…</div>
        <div
          v-else-if="filteredUploadErrorLogs.length === 0"
          class="muted-text"
        >
          目前沒有符合條件的上傳錯誤日誌
        </div>
        <div v-else class="table-wrap" style="margin-top: 8px">
          <table class="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>動作</th>
                <th>錯誤碼</th>
                <th>訊息</th>
                <th class="secondary-col">員工</th>
                <th class="secondary-col">訂單</th>
                <th class="secondary-col">瀏覽器</th>
                <th class="secondary-col">網路</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredUploadErrorLogs" :key="item.id">
                <td>{{ formatLogTime(item) }}</td>
                <td>{{ item?.context?.action || "-" }}</td>
                <td>{{ item.code || "-" }}</td>
                <td>{{ item.message || "-" }}</td>
                <td class="secondary-col">
                  {{ item.displayName || item.email || "-" }}
                </td>
                <td class="secondary-col">
                  {{
                    item?.context?.orderNumber ||
                    item?.context?.orderDocId ||
                    "-"
                  }}
                </td>
                <td class="secondary-col">
                  {{ parseBrowser(item?.context?.userAgent) }}
                </td>
                <td class="secondary-col">
                  {{ item?.context?.online ? "online" : "offline" }} /
                  {{ item?.context?.platform || "-" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="toolbar-row" style="margin-top: 20px">
          <h2 style="margin: 0">完工照片資料夾自動新建紀錄</h2>
          <button class="btn-manage" @click="loadFolderCreationLogs">
            重新整理
          </button>
        </div>
        <p class="muted-text" style="margin-top: 4px">
          理論上每張完工照片都應該對應到既有訂單資料夾。當系統找不到該訂單資料夾、改為自動新建時會記錄一筆，請逐筆核對是否需要將檔案搬到正確位置。
        </p>

        <div class="summary-row" style="margin-top: 8px">
          <span>總筆數：{{ folderCreationLogs.length }}</span>
        </div>

        <div v-if="folderCreationsLoading" class="muted-text">日誌讀取中…</div>
        <div v-else-if="folderCreationLogs.length === 0" class="muted-text">
          目前沒有自動新建資料夾的紀錄
        </div>
        <div v-else class="table-wrap" style="margin-top: 8px">
          <table class="data-table">
            <thead>
              <tr>
                <th>時間</th>
                <th>訂單號</th>
                <th>新建資料夾</th>
                <th>原因</th>
                <th class="secondary-col">上層路徑</th>
                <th class="secondary-col">員工</th>
                <th class="secondary-col">建立失敗訊息</th>
                <th>修復</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in folderCreationLogs" :key="item.id">
                <td>{{ formatFolderCreationTime(item) }}</td>
                <td>{{ item.orderNumber || item.orderDocId || "-" }}</td>
                <td>{{ item.newFolderName || "-" }}</td>
                <td>{{ item.reason || "-" }}</td>
                <td class="secondary-col">{{ item.parentPath || "-" }}</td>
                <td class="secondary-col">
                  {{ item.uploadedByEmail || item.uploadedByUid || "-" }}
                </td>
                <td class="secondary-col">
                  {{ item.createFolderError || "-" }}
                </td>
                <td style="min-width: 260px">
                  <span v-if="repairedIds.has(item.id)" style="color: #198754"
                    >✅ 已修復</span
                  >
                  <template v-else>
                    <input
                      v-model="item.correctPathInput"
                      type="text"
                      placeholder="正確路徑(可選)"
                      style="width: 110px; font-size: 13px; margin-right: 4px"
                      @click.stop
                      @keydown.stop
                    />
                    <button
                      class="btn-manage"
                      :disabled="repairingIds.has(item.id)"
                      @click="handleRepairFolder(item, item.correctPathInput)"
                    >
                      {{ repairingIds.has(item.id) ? "修復中…" : "修復" }}
                    </button>
                    <button
                      v-if="!item.suggesting && !item.suggestedPath"
                      class="btn-manage"
                      style="margin-left: 4px; background: #eee; color: #333"
                      @click="suggestFolderPath(item)"
                    >
                      搜尋建議
                    </button>
                    <span
                      v-if="item.suggesting"
                      style="margin-left: 4px; color: #888"
                      >搜尋中…</span
                    >
                    <template v-if="item.suggestedPath">
                      <div
                        style="margin-top: 2px; font-size: 12px; color: #0a0"
                      >
                        建議路徑：<span style="word-break: break-all">{{
                          item.suggestedPath
                        }}</span>
                        <button
                          class="btn-manage"
                          style="margin-left: 4px"
                          :disabled="repairingIds.has(item.id)"
                          @click="handleRepairFolder(item, item.suggestedPath)"
                        >
                          執行搬移
                        </button>
                        <button
                          class="btn-manage"
                          style="
                            margin-left: 2px;
                            background: #eee;
                            color: #333;
                          "
                          @click="item.suggestedPath = ''"
                        >
                          取消
                        </button>
                      </div>
                    </template>
                  </template>
                </td>
                import { findOrderFolderOnNas } from "../firebase"; //
                搜尋建議路徑 async function suggestFolderPath(item) { if (!item
                || !item.orderNumber) return; item.suggesting = true;
                item.suggestedPath = ""; try { const result = await
                findOrderFolderOnNas(item.orderNumber); if (result &&
                result.found && result.folderPath) { item.suggestedPath =
                result.folderPath; } else { alert(result?.message ||
                "查無建議路徑"); } } catch (e) { alert(e?.message || e); }
                finally { item.suggesting = false; } }
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ── 路由權限管理矩陣 ───────────────────────────────────── -->
        <div class="toolbar-row" style="margin-top: 28px">
          <h2 style="margin: 0">路由權限管理</h2>
          <span class="muted-text" style="font-size: 13px">勾選各角色可存取的頁面，儲存後立即生效</span>
          <button class="btn-manage" @click="savePermissions" :disabled="permSaving">
            {{ permSaving ? '儲存中…' : '儲存設定' }}
          </button>
          <button class="btn-aux" @click="resetPermissions" :disabled="permSaving">
            還原預設值
          </button>
        </div>
        <p v-if="permSaveMsg" :style="{ color: permSaveMsg.startsWith('✅') ? '#198754' : '#dc3545', marginTop: '6px' }">
          {{ permSaveMsg }}
        </p>
        <div class="table-wrap" style="margin-top: 10px; overflow-x: auto">
          <table class="data-table perm-table">
            <thead>
              <tr>
                <th style="min-width: 120px">頁面</th>
                <th v-for="role in permAllRoles" :key="role" style="text-align: center; white-space: nowrap">{{ role }}</th>
                <th style="min-width: 100px">允許部門</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in permGroups" :key="group.name">
                <tr>
                  <td :colspan="permAllRoles.length + 2" style="font-weight: 600; background: #f0f2f5; padding: 4px 10px; font-size: 13px">
                    {{ group.name }}
                  </td>
                </tr>
                <tr v-for="perm in group.items" :key="perm.path">
                  <td style="white-space: nowrap; font-size: 14px">{{ perm.title }}</td>
                  <td v-for="role in permAllRoles" :key="role" style="text-align: center">
                    <input
                      type="checkbox"
                      :checked="perm.roles.includes(role)"
                      @change="togglePermRole(perm, role, $event.target.checked)"
                      style="width: auto; height: auto; cursor: pointer"
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      :value="perm.depts ? perm.depts.join(', ') : ''"
                      @change="updatePermDepts(perm, $event.target.value)"
                      placeholder="留空=不限"
                      style="width: 90px; font-size: 12px; padding: 2px 5px"
                      title="部門代號，多個以逗號分隔，例如：1, 2"
                    />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <p class="muted-text" style="margin-top: 6px; font-size: 12px">
          ⚠️ 「admin」角色不建議取消任何頁面的存取權限，以免無法管理系統。「允許部門」填部門代號（如 1, 2），留空表示不以部門限制。角色勾選與允許部門為 OR 關係（符合其一即可進入）。
        </p>

        <div class="toolbar-row" style="margin-top: 24px">
          <h2 style="margin: 0">使用者模組預覽</h2>
          <span class="muted-text" style="font-size: 13px">依目前編輯中的預設角色與預設部門視角，即時預覽可見模組</span>
        </div>
        <div class="field-row" style="margin-top: 10px; align-items: end; gap: 12px; flex-wrap: wrap">
          <div class="field-item" style="min-width: 280px">
            <label>預覽使用者</label>
            <select v-model="previewUserId">
              <option v-for="u in users" :key="u.id" :value="u.id">
                {{ u.displayName || u.email || u.id }}
              </option>
            </select>
          </div>
          <div v-if="selectedPreviewUser" class="summary-row" style="gap: 8px; flex-wrap: wrap">
            <span>角色：{{ selectedPreviewUser.roles.join(' / ') || '—' }}</span>
            <span>預設角色：{{ selectedPreviewUser.activeRole || '—' }}</span>
            <span>部門：{{ previewDepartmentLabels || '—' }}</span>
            <span>預設部門：{{ deptLabel(selectedPreviewUser.activeDepartment) || '—' }}</span>
          </div>
        </div>
        <div v-if="selectedPreviewUser" class="preview-grid" style="margin-top: 12px">
          <div v-for="group in previewGroups" :key="group.name" class="preview-card">
            <div class="preview-head">
              <h3>{{ group.name }}</h3>
              <span class="preview-meta">{{ group.visible.length }}/{{ group.items.length }} 可見</span>
            </div>
            <div v-if="group.visible.length" class="preview-tags">
              <span v-for="item in group.visible" :key="item.path" class="preview-tag">
                {{ item.title }}
              </span>
            </div>
            <div v-else class="muted-text" style="font-size: 13px">此預設視角目前看不到此群組模組</div>
          </div>
        </div>

        <!-- 測試資料清除 -->
        <div style="margin-top: 28px; padding: 16px; background: #fff8e1; border: 1px solid #fbbf24; border-radius: 8px; max-width: 480px">
          <h3 style="margin: 0 0 8px; font-size: 15px; color: #92400e;">🧹 清除測試資料</h3>
          <p style="margin: 0 0 12px; font-size: 13px; color: #78350f;">
            刪除所有在訂單中勾選「測試標記」的訂單。此操作不可復原，請確認已完成所有測試後再執行。
          </p>
          <button
            class="btn-manage"
            style="background:#ef4444;border-color:#ef4444;color:#fff;"
            :disabled="testDataDeleting"
            @click="onClearTestData"
          >
            {{ testDataDeleting ? "刪除中…" : "清除所有測試訂單" }}
          </button>
        </div>

        <!-- 重設所有訂單狀態 -->
        <div style="margin-top: 16px; padding: 16px; background: #fff1f2; border: 1px solid #fca5a5; border-radius: 8px; max-width: 480px">
          <h3 style="margin: 0 0 8px; font-size: 15px; color: #991b1b;">⚠️ 重設所有訂單狀態</h3>
          <p style="margin: 0 0 12px; font-size: 13px; color: #7f1d1d;">
            把系統內所有訂單的狀態強制改回「草稿」。僅供測試環境使用，上線後請勿執行。
          </p>
          <button
            class="btn-manage"
            style="background:#b91c1c;border-color:#b91c1c;color:#fff;"
            :disabled="statusResetting"
            @click="onResetAllStatusToDraft"
          >
            {{ statusResetting ? "處理中…" : "全部改回草稿" }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { findOrderFolderOnNas } from "../firebase";

// 搜尋建議路徑
async function suggestFolderPath(item) {
  if (!item || !item.orderNumber) return;
  item.suggesting = true;
  item.suggestedPath = "";
  try {
    const result = await findOrderFolderOnNas(item.orderNumber);
    if (result && result.found && result.folderPath) {
      item.suggestedPath = result.folderPath;
    } else {
      alert(result?.message || "查無建議路徑");
    }
  } catch (e) {
    alert(e?.message || e);
  } finally {
    item.suggesting = false;
  }
}
import { ref, onMounted, computed, watch } from "vue";
import {
  subscribeAuthState,
  fetchAllUsers,
  updateUserDisplayName,
  updateUserRoles,
  updateUserDepartments,
  ROLES,
  listClientUploadErrors,
  listCompletionPhotoFolderCreations,
  migrateLegacyCompletionPhotosToNas,
  precheckLegacyCompletionPhotosToNas,
  repairWrongOrderFolder,
  getRoutePermissionsConfig,
  saveRoutePermissionsConfig,
  userHasAnyRole,
  canAccessPermission,
} from "../firebase";
import { getUserByUid } from "../firebase";
import { deleteTestOrders } from "../firebase";
import { resetAllOrderStatusToDraft } from "../firebase";
import { functionsInstance } from "../firebase";
import { httpsCallable } from "firebase/functions";
import {
  DEFAULT_ROUTE_PERMISSIONS,
  ALL_ROLES as PERM_ALL_ROLES,
  mergeRoutePermissions,
} from "../config/routePermissions";
import { invalidatePermissionsCache } from "../router/index";

const users = ref([]);
const testDataDeleting = ref(false);
const statusResetting = ref(false);

// 派車任務工具
const dispatchTools = ref({
  loading: false,
  action: "",
  backfillLimit: 500,
  syncDaysAhead: 7,
  forceCreatedAt: false,
  pendingCleanupKeyword: "測試",
  pendingCleanupLimit: 3000,
  ordersCleanupKeyword: "測試",
  ordersCleanupLimit: 3000,
  result: null,
  error: "",
});

async function runBackfillOrders(dryRun) {
  if (dispatchTools.value.loading) return;
  if (!dryRun && !confirm("確定要執行 Orders→salesOrders 全量回填?")) return;
  dispatchTools.value.loading = true;
  dispatchTools.value.action = dryRun ? "backfill-dry" : "backfill";
  dispatchTools.value.error = "";
  dispatchTools.value.result = null;
  try {
    const call = httpsCallable(functionsInstance, "backfillSalesOrdersFromOrders", { timeout: 540000 });
    const res = await call({
      dryRun,
      limit: Math.min(5000, Math.max(1, Number(dispatchTools.value.backfillLimit) || 1000)),
      forceCreatedAt: !!dispatchTools.value.forceCreatedAt,
    });
    dispatchTools.value.result = res.data;
  } catch (e) {
    dispatchTools.value.error = e?.message || String(e);
  } finally {
    dispatchTools.value.loading = false;
    dispatchTools.value.action = "";
  }
}

async function runNightlySync(dryRun) {
  if (dispatchTools.value.loading) return;
  if (!dryRun && !confirm("確定要立即執行夜班同步 (建立 installTasks)?")) return;
  dispatchTools.value.loading = true;
  dispatchTools.value.action = dryRun ? "sync-dry" : "sync";
  dispatchTools.value.error = "";
  dispatchTools.value.result = null;
  try {
    const call = httpsCallable(functionsInstance, "runNightlySyncNow", { timeout: 540000 });
    const res = await call({
      dryRun,
      daysAhead: Math.min(30, Math.max(1, Number(dispatchTools.value.syncDaysAhead) || 7)),
    });
    dispatchTools.value.result = res.data;
  } catch (e) {
    dispatchTools.value.error = e?.message || String(e);
  } finally {
    dispatchTools.value.loading = false;
    dispatchTools.value.action = "";
  }
}

async function runPurgeLegacy(dryRun) {
  if (dispatchTools.value.loading) return;
  if (!dryRun && !confirm("確定要刪除 salesOrders 中所有 mirrorSource='Orders' 的鏡像文件?\n\n之後 installTasks 在夜班同步時可重新建立,但指到 legacy_* 的舊 installTasks 參照會斷裂。")) return;
  dispatchTools.value.loading = true;
  dispatchTools.value.action = dryRun ? "purge-dry" : "purge";
  dispatchTools.value.error = "";
  dispatchTools.value.result = null;
  try {
    const call = httpsCallable(functionsInstance, "purgeLegacyMirroredSalesOrders", { timeout: 540000 });
    const res = await call({
      dryRun,
      limit: Math.min(10000, Math.max(1, Number(dispatchTools.value.backfillLimit) || 5000)),
    });
    dispatchTools.value.result = res.data;
  } catch (e) {
    dispatchTools.value.error = e?.message || String(e);
  } finally {
    dispatchTools.value.loading = false;
    dispatchTools.value.action = "";
  }
}

async function runPendingCleanup(dryRun) {
  if (dispatchTools.value.loading) return;
  const keyword = String(dispatchTools.value.pendingCleanupKeyword || "").trim();
  if (!keyword) {
    dispatchTools.value.error = "請先輸入要刪除的測試關鍵字";
    return;
  }
  if (!dryRun && !confirm(`確定要刪除 PendingOrders 中包含「${keyword}」的測試資料？\n\n此操作會影響員工查詢結果，且無法復原。`)) return;

  dispatchTools.value.loading = true;
  dispatchTools.value.action = dryRun ? "pending-cleanup-dry" : "pending-cleanup";
  dispatchTools.value.error = "";
  dispatchTools.value.result = null;
  try {
    const call = httpsCallable(functionsInstance, "purgePendingTestOrders", { timeout: 540000 });
    const res = await call({
      dryRun,
      keyword,
      limit: Math.min(10000, Math.max(1, Number(dispatchTools.value.pendingCleanupLimit) || 3000)),
    });
    dispatchTools.value.result = res.data;
  } catch (e) {
    dispatchTools.value.error = e?.message || String(e);
  } finally {
    dispatchTools.value.loading = false;
    dispatchTools.value.action = "";
  }
}

async function runOrdersCleanup(dryRun) {
  if (dispatchTools.value.loading) return;
  const keyword = String(dispatchTools.value.ordersCleanupKeyword || "").trim();
  if (!keyword) {
    dispatchTools.value.error = "請先輸入要刪除的測試關鍵字";
    return;
  }
  if (!dryRun && !confirm(`確定要刪除 Orders 中包含「${keyword}」的測試資料？\n\n此操作會直接影響正式訂單查詢，且無法復原。`)) return;

  dispatchTools.value.loading = true;
  dispatchTools.value.action = dryRun ? "orders-cleanup-dry" : "orders-cleanup";
  dispatchTools.value.error = "";
  dispatchTools.value.result = null;
  try {
    const call = httpsCallable(functionsInstance, "purgeOrdersTestData", { timeout: 540000 });
    const res = await call({
      dryRun,
      keyword,
      limit: Math.min(10000, Math.max(1, Number(dispatchTools.value.ordersCleanupLimit) || 3000)),
    });
    dispatchTools.value.result = res.data;
  } catch (e) {
    dispatchTools.value.error = e?.message || String(e);
  } finally {
    dispatchTools.value.loading = false;
    dispatchTools.value.action = "";
  }
}

async function onClearTestData() {
  if (!confirm("確定要刪除所有標記為「測試資料」的訂單嗎？此操作無法復原。")) return;
  testDataDeleting.value = true;
  try {
    const count = await deleteTestOrders();
    alert(`已刪除 ${count} 筆測試訂單。`);
  } catch (e) {
    alert("刪除失敗：" + (e?.message || e));
  } finally {
    testDataDeleting.value = false;
  }
}

async function onResetAllStatusToDraft() {
  if (!confirm("確定要把所有訂單的狀態全部改回「草稿」嗎？此操作無法復原。")) return;
  statusResetting.value = true;
  try {
    const count = await resetAllOrderStatusToDraft();
    alert(`已將 ${count} 筆訂單重設為草稿。`);
  } catch (e) {
    alert("操作失敗：" + (e?.message || e));
  } finally {
    statusResetting.value = false;
  }
}
const loading = ref(true);
const isAdmin = ref(false);
const currentUid = ref(null);
const logsLoading = ref(false);
const uploadErrorLogs = ref([]);
const folderCreationsLoading = ref(false);
const folderCreationLogs = ref([]);
const repairingIds = ref(new Set());
const repairedIds = ref(new Set());
// 舊照片遷移工具預設隱藏；若日後又有需要可改為 true 暫時打開。
const showLegacyMigration = ref(false);
const logFilters = ref({
  days: 7,
  action: "",
  keyword: "",
});
const migrationLoading = ref(false);
const migrationPrecheckLoading = ref(false);
const migrationForm = ref({
  orderId: "",
  limit: 20,
  deleteStorageAfterSync: false,
});
const migrationResult = ref(null);
const migrationPrecheckResult = ref(null);
const migrationPrecheckKey = ref("");
// 不能修改的超級管理者 email
const adminEmail = "linlilung@gmail.com";

// 可用角色清單
const roles = ROLES;

// 部門選項
const deptOptions = [
  { value: '1', label: '1 辦公室' },
  { value: '2', label: '2 裝安' },
  { value: '3', label: '3 廠內' },
  { value: '4', label: '4 外勞' },
];

function deptLabel(value) {
  return deptOptions.find((item) => item.value === String(value || ""))?.label || String(value || "");
}

async function loadUsers() {
  loading.value = true;
  const list = await fetchAllUsers();
  users.value = list.map((u) => ({
    ...u,
    roles: Array.isArray(u.roles) && u.roles.length ? [...u.roles] : [u.role || "遊客"],
    activeRole: u.activeRole || u.role || "遊客",
    departments: Array.isArray(u.departments) ? [...u.departments] : (u.dept ? [u.dept] : []),
    activeDepartment: u.activeDepartment || u.dept || "",
    _origRoles: JSON.stringify(
      [...(Array.isArray(u.roles) && u.roles.length ? u.roles : [u.role || "遊客"])]
        .sort(),
    ),
    _origActiveRole: u.activeRole || u.role || "遊客",
    _origName: u.displayName || "",
    _origDepartments: JSON.stringify([...(Array.isArray(u.departments) ? u.departments : (u.dept ? [u.dept] : []))].sort()),
    _origActiveDepartment: u.activeDepartment || u.dept || "",
  }));
  loading.value = false;
}

function changed(u) {
  return JSON.stringify([...(u.roles || [])].sort()) !== u._origRoles
    || u.activeRole !== u._origActiveRole
    || (u.displayName || "") !== u._origName
    || JSON.stringify([...(u.departments || [])].sort()) !== u._origDepartments
    || (u.activeDepartment || "") !== u._origActiveDepartment;
}

function toggleUserRole(u, role, checked) {
  const nextRoles = checked
    ? [...u.roles, role]
    : u.roles.filter((item) => item !== role);
  const uniqueRoles = Array.from(new Set(nextRoles));
  u.roles = uniqueRoles.length ? uniqueRoles : ["遊客"];
  if (!u.roles.includes(u.activeRole)) {
    u.activeRole = u.roles[0];
  }
}

function toggleUserDepartment(u, dept, checked) {
  const nextDepartments = checked
    ? [...u.departments, dept]
    : u.departments.filter((item) => item !== dept);
  const uniqueDepartments = Array.from(new Set(nextDepartments));
  u.departments = uniqueDepartments;
  if (!u.departments.includes(u.activeDepartment)) {
    u.activeDepartment = u.departments[0] || "";
  }
}

async function applyRole(u) {
  const rolesChanged = JSON.stringify([...(u.roles || [])].sort()) !== u._origRoles;
  const activeRoleChanged = u.activeRole !== u._origActiveRole;
  const departmentsChanged = JSON.stringify([...(u.departments || [])].sort()) !== u._origDepartments;
  const activeDepartmentChanged = u.activeDepartment !== u._origActiveDepartment;

  if (rolesChanged || activeRoleChanged || departmentsChanged || activeDepartmentChanged) {
    if (u.id === currentUid.value) {
      alert("無法變更自己的角色、部門與視角設定。");
      return;
    }
    if (u.email === adminEmail) {
      alert("此帳號的角色、部門與視角不可變更。");
      return;
    }
    await updateUserRoles(u.id, u.roles, u.activeRole);
    await updateUserDepartments(u.id, u.departments, u.activeDepartment);
  }
  if ((u.displayName || "") !== u._origName) {
    await updateUserDisplayName(u.id, u.displayName || "");
  }
  await loadUsers();
}

async function runLegacyMigration() {
  if (!canRunMigration.value) {
    alert("請先執行遷移前檢查，並確認有可遷移資料後再執行。");
    return;
  }

  migrationLoading.value = true;
  migrationResult.value = null;
  try {
    const result = await migrateLegacyCompletionPhotosToNas({
      orderId: String(migrationForm.value.orderId || "").trim(),
      limit: Number(migrationForm.value.limit || 20),
      deleteStorageAfterSync: Boolean(
        migrationForm.value.deleteStorageAfterSync,
      ),
    });
    if (result && result.ok === false) {
      alert(
        `執行舊照片遷移失敗：${
          result.errorMessage || "未知錯誤"
        }\n錯誤代碼：${result.errorCode || "failed-precondition"}`,
      );
      migrationResult.value = result;
      migrationLoading.value = false;
      return;
    }
    migrationResult.value = result;
  } catch (e) {
    console.error("執行舊照片遷移失敗：", e);
    const code = String(e?.code || "").trim();
    const details =
      e?.details !== undefined && e?.details !== null
        ? `\n細節：${
            typeof e.details === "string"
              ? e.details
              : JSON.stringify(e.details)
          }`
        : "";
    alert(
      `執行舊照片遷移失敗：${e?.message || e}${
        code ? `\n錯誤代碼：${code}` : ""
      }${details}`,
    );
  }
  migrationLoading.value = false;
}

async function runLegacyMigrationPrecheck() {
  migrationPrecheckLoading.value = true;
  migrationPrecheckResult.value = null;
  migrationPrecheckKey.value = "";
  try {
    const result = await precheckLegacyCompletionPhotosToNas({
      orderId: String(migrationForm.value.orderId || "").trim(),
      limit: Number(migrationForm.value.limit || 20),
    });
    if (result && result.ok === false) {
      alert(
        `執行遷移前檢查失敗：${
          result.errorMessage || "未知錯誤"
        }\n錯誤代碼：${result.errorCode || "failed-precondition"}`,
      );
      migrationPrecheckResult.value = result;
      migrationPrecheckLoading.value = false;
      return;
    }
    migrationPrecheckResult.value = result;
    migrationPrecheckKey.value = buildMigrationPrecheckKey();
    if (!Number(result?.candidates || 0)) {
      alert("檢查完成：目前沒有可遷移的舊照片。");
    }
  } catch (e) {
    console.error("執行遷移前檢查失敗：", e);
    const code = String(e?.code || "").trim();
    const details =
      e?.details !== undefined && e?.details !== null
        ? `\n細節：${
            typeof e.details === "string"
              ? e.details
              : JSON.stringify(e.details)
          }`
        : "";
    alert(
      `執行遷移前檢查失敗：${e?.message || e}${
        code ? `\n錯誤代碼：${code}` : ""
      }${details}`,
    );
  }
  migrationPrecheckLoading.value = false;
}

function buildMigrationPrecheckKey() {
  return JSON.stringify({
    orderId: String(migrationForm.value.orderId || "").trim(),
    limit: Number(migrationForm.value.limit || 20),
  });
}

const canRunMigration = computed(() => {
  if (migrationLoading.value || migrationPrecheckLoading.value) return false;
  if (!migrationPrecheckResult.value?.ok) return false;
  if (Number(migrationPrecheckResult.value?.candidates || 0) <= 0) return false;
  return migrationPrecheckKey.value === buildMigrationPrecheckKey();
});

watch(
  () => [migrationForm.value.orderId, migrationForm.value.limit],
  () => {
    migrationPrecheckResult.value = null;
    migrationPrecheckKey.value = "";
  },
);

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatLogTime(item) {
  const createdAt = toDate(item?.createdAt);
  const fallback = toDate(item?.context?.occurredAtClient);
  const d = createdAt || fallback;
  if (!d) return "-";
  return d.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function includesKeyword(item, keyword) {
  const k = String(keyword || "")
    .trim()
    .toLowerCase();
  if (!k) return true;
  const haystack = [
    item?.code,
    item?.message,
    item?.email,
    item?.displayName,
    item?.context?.orderNumber,
    item?.context?.orderDocId,
    item?.context?.fileName,
  ]
    .map((v) => String(v || "").toLowerCase())
    .join(" ");
  return haystack.includes(k);
}

function parseBrowser(ua) {
  if (!ua) return "-";
  const u = ua;
  // In-app browsers
  if (/SamsungBrowser\/([\d.]+)/i.test(u))
    return `Samsung ${RegExp.$1.split(".")[0]}`;
  if (/Line\/([\d.]+)/i.test(u)) return `LINE ${RegExp.$1.split(".")[0]}`;
  if (/Instagram/i.test(u)) return "Instagram";
  if (/FBAV\/|FBAN\/|FB_IAB/i.test(u)) return "Facebook";
  if (/KakaoTalk/i.test(u)) return "KakaoTalk";
  // Edge
  if (/EdgA\/([\d.]+)/i.test(u)) return `Edge(A) ${RegExp.$1.split(".")[0]}`;
  if (/Edg\/([\d.]+)/i.test(u)) return `Edge ${RegExp.$1.split(".")[0]}`;
  // Chrome on iOS
  if (/CriOS\/([\d.]+)/i.test(u))
    return `Chrome(iOS) ${RegExp.$1.split(".")[0]}`;
  // Firefox on iOS
  if (/FxiOS\/([\d.]+)/i.test(u))
    return `Firefox(iOS) ${RegExp.$1.split(".")[0]}`;
  // Firefox
  if (/Firefox\/([\d.]+)/i.test(u)) return `Firefox ${RegExp.$1.split(".")[0]}`;
  // Chrome
  if (/Chrome\/([\d.]+)/i.test(u)) return `Chrome ${RegExp.$1.split(".")[0]}`;
  // Safari (no Chrome/Chromium in UA)
  if (/Version\/([\d.]+).*Safari/i.test(u))
    return `Safari ${RegExp.$1.split(".")[0]}`;
  if (/Safari/i.test(u)) return "Safari";
  return ua.slice(0, 30);
}

const filteredUploadErrorLogs = computed(() => {
  const now = Date.now();
  const days = Number(logFilters.value.days || 7);
  const action = String(logFilters.value.action || "").trim();
  const keyword = String(logFilters.value.keyword || "").trim();
  const minTimestamp = now - days * 24 * 60 * 60 * 1000;

  return (uploadErrorLogs.value || []).filter((item) => {
    const createdAt =
      toDate(item?.createdAt) || toDate(item?.context?.occurredAtClient);
    if (createdAt && createdAt.getTime() < minTimestamp) return false;
    if (action && String(item?.context?.action || "") !== action) return false;
    return includesKeyword(item, keyword);
  });
});

async function loadUploadErrorLogs() {
  logsLoading.value = true;
  try {
    uploadErrorLogs.value = await listClientUploadErrors(250);
  } catch (e) {
    console.error("讀取上傳錯誤日誌失敗：", e);
    uploadErrorLogs.value = [];
  }
  logsLoading.value = false;
}

async function loadFolderCreationLogs() {
  folderCreationsLoading.value = true;
  try {
    folderCreationLogs.value = await listCompletionPhotoFolderCreations(250);
  } catch (e) {
    console.error("讀取資料夾自動新建紀錄失敗：", e);
    folderCreationLogs.value = [];
  }
  folderCreationsLoading.value = false;
}

function formatFolderCreationTime(item) {
  const d = toDate(item?.createdAt);
  if (!d) return "-";
  return d.toLocaleString("zh-TW", { hour12: false });
}

async function handleRepairFolder(item, userInputCorrectPath = "") {
  const orderNumber = String(
    item?.orderNumber || item?.orderDocId || "",
  ).trim();
  if (!orderNumber) {
    alert("此筆紀錄沒有訂單號碼，無法修復");
    return;
  }
  if (
    !confirm(
      `確定要修復訂單「${orderNumber}」嗎？\n會把錯誤資料夾內的檔案搬到正確資料夾，並刪除空的錯誤資料夾。`,
    )
  )
    return;

  // 觸發 reactivity（Set 直接 add 不會觸發 Vue 重繪）
  repairingIds.value = new Set(repairingIds.value).add(item.id);
  try {
    // 從稽核紀錄組出實際被新建的「錯誤資料夾路徑」，避免修復程式誤判
    let wrongPath = String(item?.fullPath || "").trim();
    if (!wrongPath) {
      const parent = String(item?.parentPath || "").trim();
      const folderName = String(item?.newFolderName || "").trim();
      if (parent && folderName) {
        wrongPath = parent.endsWith("/")
          ? parent + folderName
          : `${parent}/${folderName}`;
      }
    }
    let correctPath = String(userInputCorrectPath || "").trim();
    const result = await repairWrongOrderFolder(
      orderNumber,
      false,
      wrongPath,
      correctPath,
    );
    if (result?.ok) {
      const movedFiles = Number(result?.movedFiles || 0);
      const folderDeleted = Boolean(result?.folderDeleted);
      const updatedDocs = Number(result?.updatedPhotoDocs || 0);
      alert(
        `修復成功：\n搬移檔案 ${movedFiles} 個\n更新照片紀錄 ${updatedDocs} 筆\n錯誤資料夾${folderDeleted ? "已刪除" : "未刪除（可能還有子資料夾）"}\n` +
          `正確路徑：${result.correctPath}`,
      );
      // 修復成功後，從列表移除該筆紀錄
      folderCreationLogs.value = folderCreationLogs.value.filter(
        (row) => row.id !== item.id,
      );
    } else {
      alert(`無法修復：${result?.message || "未知原因"}`);
    }
  } catch (e) {
    console.error("repairWrongOrderFolder failed:", e);
    alert(`修復失敗：${e?.message || e}`);
  } finally {
    const next = new Set(repairingIds.value);
    next.delete(item.id);
    repairingIds.value = next;
  }
}

// ── 路由權限矩陣 ────────────────────────────────────────────────────────────
const permAllRoles = PERM_ALL_ROLES;

function deepCloneRoutes(routes) {
  return routes.map((r) => ({ ...r, roles: [...(r.roles || [])], depts: r.depts ? [...r.depts] : undefined }));
}

// 立即以預設值初始化，確保頁面首次渲染就有資料；Firestore 有自訂設定時再覆蓋
const permRoutes = ref(deepCloneRoutes(DEFAULT_ROUTE_PERMISSIONS));
const permSaving = ref(false);
const permSaveMsg = ref('');

async function loadPermissions() {
  const firestoreRoutes = await getRoutePermissionsConfig();
  permRoutes.value = deepCloneRoutes(
    mergeRoutePermissions(DEFAULT_ROUTE_PERMISSIONS, firestoreRoutes || []),
  );
}

const permGroups = computed(() => {
  const groups = [];
  const seen = new Map();
  for (const perm of permRoutes.value) {
    const g = perm.group || '其他';
    if (!seen.has(g)) {
      const entry = { name: g, items: [] };
      seen.set(g, entry);
      groups.push(entry);
    }
    seen.get(g).items.push(perm);
  }
  return groups;
});

const previewUserId = ref("");

const selectedPreviewUser = computed(() => {
  if (!users.value.length) return null;
  return users.value.find((user) => user.id === previewUserId.value) || users.value[0];
});

const previewDepartmentLabels = computed(() => {
  const departments = selectedPreviewUser.value?.departments || [];
  return departments.map((dept) => deptLabel(dept)).join(" / ");
});

const previewPerspectiveUser = computed(() => {
  const user = selectedPreviewUser.value;
  if (!user) return null;
  return {
    ...user,
    roles: user.activeRole ? [user.activeRole] : [],
    role: user.activeRole || "",
    departments: user.activeDepartment ? [user.activeDepartment] : [],
    dept: user.activeDepartment || "",
  };
});

const previewGroups = computed(() => {
  if (!previewPerspectiveUser.value) return [];
  const groups = [];
  const seen = new Map();
  for (const perm of permRoutes.value) {
    const groupName = perm.group || "其他";
    if (!seen.has(groupName)) {
      const entry = { name: groupName, items: [], visible: [] };
      seen.set(groupName, entry);
      groups.push(entry);
    }
    const bucket = seen.get(groupName);
    bucket.items.push(perm);
    if (canAccessPermission(previewPerspectiveUser.value, perm)) {
      bucket.visible.push(perm);
    }
  }
  return groups;
});

watch(
  users,
  (list) => {
    if (!list.length) {
      previewUserId.value = "";
      return;
    }
    if (!list.some((user) => user.id === previewUserId.value)) {
      previewUserId.value = list[0].id;
    }
  },
  { immediate: true },
);

function togglePermRole(perm, role, checked) {
  if (checked) {
    if (!perm.roles.includes(role)) perm.roles.push(role);
  } else {
    perm.roles = perm.roles.filter((r) => r !== role);
  }
}

function updatePermDepts(perm, rawValue) {
  const parts = String(rawValue || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  perm.depts = parts.length ? parts : undefined;
}

async function savePermissions() {
  permSaving.value = true;
  permSaveMsg.value = '';
  try {
    await saveRoutePermissionsConfig(permRoutes.value);
    invalidatePermissionsCache();
    window.dispatchEvent(new CustomEvent('route-permissions-updated'));
    permSaveMsg.value = '✅ 已儲存，設定立即生效';
  } catch (e) {
    console.error('savePermissions failed:', e);
    permSaveMsg.value = `❌ 儲存失敗：${e?.message || e}`;
  }
  permSaving.value = false;
}

async function resetPermissions() {
  if (!confirm('確定要還原所有頁面為預設權限嗎？')) return;
  permRoutes.value = deepCloneRoutes(DEFAULT_ROUTE_PERMISSIONS);
  permSaveMsg.value = '（已還原預設值，請按「儲存設定」使其生效）';
}

onMounted(() => {
  subscribeAuthState(async (u) => {
    if (!u) {
      isAdmin.value = false;
      currentUid.value = null;
      return;
    }
    currentUid.value = u.uid;
    const currentUserDoc = await getUserByUid(u.uid);
    isAdmin.value = userHasAnyRole(currentUserDoc, ["admin", "管理者"]);
    if (isAdmin.value) {
      await loadUsers();
      await loadUploadErrorLogs();
      await loadFolderCreationLogs();
      await loadPermissions();
    }
  });
});
</script>

<style scoped>
.name-input {
  width: 100%;
  max-width: 160px;
  padding: 3px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 0.95rem;
}
.name-input:focus {
  outline: none;
  border-color: #4a90e2;
}

.role-checklist {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 220px;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #f9fafb;
  font-size: 0.85rem;
}

.role-chip input {
  width: auto;
  height: auto;
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.preview-card {
  border: 1px solid #dbe3ef;
  border-radius: 10px;
  padding: 12px;
  background: #f8fbff;
}

.preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.preview-head h3 {
  margin: 0;
  font-size: 14px;
}

.preview-meta {
  font-size: 12px;
  color: #64748b;
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preview-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 4px 10px;
  background: #0f766e;
  color: #fff;
  font-size: 12px;
}
</style>
