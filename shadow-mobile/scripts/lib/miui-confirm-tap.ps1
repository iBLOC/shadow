<#
    MIUI「继续安装」弹窗的**判据内核**（纯函数 ⇒ ⇒ 可离线自检）。

    ## 这一族回答什么

    弹窗只活**约 6 秒**（「拒绝（6）」里的 6 是倒计时）⇒ ⇒
    ⇒ ⇒ **判据每轮要花的时间，必须远小于 6 秒**。
    ⇒ ⇒ 旧版守门员每轮做一次 `uiautomator dump`（实测 **2–4 秒**）
    ⇒ ⇒ ⇒ 一轮就吃掉半个窗口 ⇒ ⇒ **结构上追不上**
    ⇒ ⇒ ⇒ 实测连装 3 次**全部** `INSTALL_FAILED_USER_RESTRICTED`。

    ⇒ ⇒ **通用形态（这一族的教训）**：
      **一个判据若每轮要 2–4 秒 ⇒ ⇒ 它天然追不上 6 秒的窗口
      ⇒ ⇒ 判据必须分层：「便宜的判据负责**触发**，贵的判据只在**命中之后**跑一次」。**

    ## 三段形状（与守门员本体一一对应）

    ❶ **快触发**：`dumpsys window | grep mCurrentFocus` —— 实测 **73 ms**
       ⇒ ⇒ 判「当前焦点是不是那个确认框」⇒ ⇒ 命中后**立刻**去点。
    ❷ **取坐标**：命中之后才做一次 `uiautomator dump` 解析「继续安装」的 bounds
       ⇒ ⇒ **缓存**⇒ ⇒ 同一窗口里第二次弹窗（安装重试）**零 dump**。
    ❸ **兜底**：慢速扫树 ⇒ ⇒ 认不认得焦点都做 ⇒ ⇒ **不会漏**
       ⇒ ⇒ 代价是慢，但**不会像旧版那样从头到尾没点过**。

    ## ⚠️ 为什么「缓存坐标」是安全的

    同一个弹窗在同一台设备上**位置不变** ⇒ ⇒ 点的还是同一个按钮。
    ⇒ ⇒ 但**换设备/换分辨率**就不成立 ⇒ ⇒ 缓存是**每台设备**的
    ⇒ ⇒ ⇒ 而缓存键里带了设备号 ⇒ ⇒ 别的设备不会误用。
#>

function Test-ConfirmDialogFocused {
    <#
      快触发 —— 「当前焦点是不是那个确认框」。
      ⚠️⚠️ **判据的包名是实测出来的，不是猜的**（odin，2026-11-10）：
      ⇒ ⇒ 弹窗在场时，`mCurrentFocus` 逐字是
      `mCurrentFocus=Window{... u0 com.lbe.security.miui/com.android.packageinstaller.permission.ui.GrantPermissionsActivity}`
      ⇒ ⇒ ⚠️ **注意包名是 `com.lbe.security.miui`**，**不是** `com.miui.securitycenter`
      ⇒ ⇒ ⇒ 而 `com.miui.securitycenter` 是**弹窗内容**的包名（uiautomator 树里那个）
      ⇒ ⇒ ⇒ **这两个是两回事** ⇒ ⇒ 拿内容包名当焦点判据 ⇒ ⇒ **永远不命中**
      ⇒ ⇒ ⇒ （我第一版就是这么写的 ⇒ ⇒ 实测「装上了」其实是**慢路径兜底**干的
      ⇒ ⇒ ⇒ ⇒ 快触发一次都没命中过 ⇒ ⇒ **假绿**）
      ⇒ ⇒ ⇒ **通用形态：「窗口的包名」与「内容的包名」是两件事 ⇒ ⇒ 判据要用**量到**的那个**。
      ⚠️ 孪生：焦点在**别的**窗口（自家 app / 设置 / 启动器）⇒ ⇒ 不许触发。
    #>
    param([string]$FocusLine)
    if (-not $FocusLine) { return $false }
    return ($FocusLine -match 'lbe\.security\.miui')
}

function Resolve-ContinueButtonBounds {
    <#
      慢路径 —— 从整棵树里找「继续安装」那个节点的 bounds（中心点）。
      ⚠️ 解析不出来就返回 null ⇒ ⇒ **不许**当成了（那是「失败长得像成功」）。
    #>
    param([string]$Xml)
    if (-not $Xml) { return $null }
    foreach ($n in [regex]::Matches($Xml, '<node[^>]*>')) {
        $v = $n.Value
        if ($v -match 'text="继续安装"') {
            $b = [regex]::Match($v, 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)]"')
            if ($b.Success) {
                return [pscustomobject]@{
                    x = [int](([int]$b.Groups[1].Value + [int]$b.Groups[3].Value) / 2)
                    y = [int](([int]$b.Groups[2].Value + [int]$b.Groups[4].Value) / 2)
                }
            }
        }
    }
    return $null
}

function Get-ConfirmTapPlan {
    <#
      **这一段的决策** —— 给定「焦点是什么」＋「有没有缓存坐标」，返回该怎么办。
      ⇒ ⇒ 判据只做纯函数 ⇒ ⇒ **可离线自检** ⇒ ⇒ 不用连设备就能钉住。

      返回：
        Action = 'tap-cached'   ｜ 已有缓存 ⇒ ⇒ 立刻点（零 dump ⇒ ⇒ 抢得回窗口）
                = 'resolve'      ｜ 第一次命中 ⇒ ⇒ 慢路径解析一次坐标
                = 'slow-scan'    ｜ 兜底 ⇒ ⇒ 慢速扫树
                = 'wait'         ｜ 什么也没命中 ⇒ ⇒ 继续等
    #>
    param(
        [string]$FocusLine,
        [bool]$HasCached,
        [bool]$SlowDue
    )
    if (Test-ConfirmDialogFocused -FocusLine $FocusLine) {
        if ($HasCached) { return 'tap-cached' }
        return 'resolve'
    }
    if ($SlowDue) { return 'slow-scan' }
    return 'wait'
}

function Invoke-MiuiConfirmTapSelfCheck {
    <#
      自检 —— 用**真机抓来的样本**把上面三个判据钉一遍。
      ⇒ ⇒ 返回：`Ok`（布尔）＋ `Cases`（逐条：名字/过没过/说明）＋ `Failures`。
      ⇒ ⇒ **逐条报出来** ⇒ ⇒ 「0 条用例」是**空绿**。
    #>
    $cases = @()

    # ---- 样本 A：**真机原样**的焦点行（odin，2026-11-10 实测抓的）----
    # ⚠️⚠️ **包名是 `com.lbe.security.miui`**（**窗口**的包名）
    # ⚠️ ⚠️ 而 `com.miui.securitycenter` 是**内容**的包名（uiautomator 树里那个）
    # ⚠️ ⚠️ ⇒ ⇒ 拿内容包名当焦点判据 ⇒ ⇒ **永远不命中** ⇒ ⇒ 假绿。
    $focusDialog = '  mCurrentFocus=Window{bebb261 u0 com.lbe.security.miui/com.android.packageinstaller.permission.ui.GrantPermissionsActivity}'
    # ---- 样本 A2：**孪生** —— 焦点是**内容**包名（securitycenter）⇒ ⇒ **不许**触发
    # ⇒ ⇒ 这一条专门钉住「窗口包名 ≠ 内容包名」那一族。
    $focusContentOnly = '  mCurrentFocus=Window{dcbc68e u0 com.miui.securitycenter/com.miui.securitycenter.InstallPermissionActivity}'
    # ---- 样本 B：焦点在自家 app（**孪生**：不许触发）----
    $focusOwn = '  mCurrentFocus=Window{bebb261 u0 com.ibloc.shadow/com.ibloc.shadow.MainActivity}'
    # ---- 样本 C：焦点在设置（**孪生**：不许触发）----
    $focusSettings = '  mCurrentFocus=Window{dcbc68e u0 com.android.settings/com.android.settings.Settings$DevelopmentSettingsDashboardActivity}'

    # ---- 样本 D：**真机原样**的弹窗树（odin，2026-11-10 实测抓的，只留相关节点）----
    $dialogXml = @'
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0"><node index="0" text="" class="android.widget.FrameLayout" package="com.miui.securitycenter" bounds="[0,0][1080,2296]"><node index="0" text="USB安装提示" resource-id="com.miui.securitycenter:id/alertTitle" class="android.widget.TextView" package="com.miui.securitycenter" bounds="[386,1607][694,1676]" /><node index="0" text="继续安装" resource-id="android:id/button2" class="android.widget.Button" package="com.miui.securitycenter" clickable="true" enabled="true" bounds="[113,2142][523,2276]" /><node index="1" text="拒绝（6）" resource-id="android:id/button1" class="android.widget.Button" package="com.miui.securitycenter" clickable="true" enabled="true" bounds="[556,2142][967,2276]" /></node></hierarchy>
'@

    # ---- 样本 E：树里**没有**那个弹窗（**孪生**：解析不出来就返回 null）----
    $otherXml = @'
<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0"><node index="0" text="开发者选项" class="android.widget.TextView" package="com.android.settings" bounds="[0,0][1080,2296]" /></node></hierarchy>
'@

    $ok = $true
    $failures = @()
    # ⚠️⚠️ **不要用嵌套函数去 `+=` 累加** —— 闭包里 `$script:cases` 与外层
    # `$cases` **不是同一个变量** ⇒ ⇒ `+=` 撞上 PSObject 的 op_Addition
    # ⇒ ⇒ 报「不包含名为 'op_Addition' 的方法」⇒ ⇒ 而**用例一条都没进**
    # ⇒ ⇒ ⇒ 读数上会变成「共 0 条，失败 0 条」⇒ ⇒ **空绿**
    # ⇒ ⇒ ⇒ **通用形态：自检自己报错时，它不会「红」，它会「空」**
    # ⇒ ⇒ ⇒ 所以「共 N 条」这个数必须**断言 N > 0**（脚本里已经断言了）。
    $cases = @(
        [pscustomobject]@{
            Name = '快触发：焦点在确认框 ⇒ ⇒ 触发'
            Ok = [bool](Test-ConfirmDialogFocused -FocusLine $focusDialog)
            Detail = '焦点含 securitycenter ⇒ ⇒ 判「弹窗在场」'
        }
        [pscustomobject]@{
            Name = '孪生：焦点是**内容**包名（securitycenter）⇒ ⇒ 不触发（窗口包名 ≠ 内容包名）'
            Ok = [bool](-not (Test-ConfirmDialogFocused -FocusLine $focusContentOnly))
            Detail = '焦点是 com.miui.securitycenter（**内容**的包名）⇒ ⇒ 但焦点窗口的包名是 com.lbe.security.miui ⇒ ⇒ 拿内容包名当判据 ⇒ ⇒ 永远不命中 ⇒ ⇒ **假绿**'
        }
        [pscustomobject]@{
            Name = '孪生：焦点在自家 app ⇒ ⇒ 不触发'
            Ok = [bool](-not (Test-ConfirmDialogFocused -FocusLine $focusOwn))
            Detail = '焦点是 com.ibloc.shadow ⇒ ⇒ 弹窗不在场 ⇒ ⇒ 不许点（乱点会点到 app 的界面）'
        }
        [pscustomobject]@{
            Name = '孪生：焦点在系统设置 ⇒ ⇒ 不触发'
            Ok = [bool](-not (Test-ConfirmDialogFocused -FocusLine $focusSettings))
            Detail = '焦点是 com.android.settings ⇒ ⇒ 弹窗不在场 ⇒ ⇒ 不许点'
        }
        [pscustomobject]@{
            Name = '孪生：空焦点行 ⇒ ⇒ 不触发'
            Ok = [bool](-not (Test-ConfirmDialogFocused -FocusLine ''))
            Detail = '读不到焦点 ⇒ ⇒ 判不了 ⇒ ⇒ 不许当成「在」'
        }
    )

    # ---- 样本 D 的解析结果（**先算出来**再拼进用例 ⇒ ⇒ 免得闭包）----
    $btn = Resolve-ContinueButtonBounds -Xml $dialogXml
    $btnX = -1
    $btnY = -1
    $btnFound = $false
    if ($btn) { $btnX = $btn.x; $btnY = $btn.y; $btnFound = $true }
    $otherBtn = Resolve-ContinueButtonBounds -Xml $otherXml

    $cases += [pscustomobject]@{
        Name = '取坐标：真机弹窗树 ⇒ ⇒ 解析出「继续安装」的中心'
        Ok = ($btnFound -and $btnX -eq 318 -and $btnY -eq 2209)
        Detail = ('bounds=[113,2142][523,2276] ⇒ ⇒ 中心 (' + $btnX + ',' + $btnY + ')')
    }
    $cases += [pscustomobject]@{
        Name = '孪生：树里没有那个弹窗 ⇒ ⇒ 返回 null（**不许**当成 0,0）'
        Ok = ($null -eq $otherBtn)
        Detail = '解析不出来就 null ⇒ ⇒ 否则会点到屏幕左上角 ⇒ ⇒ 那是「失败长得像成功」'
    }
    $cases += [pscustomobject]@{
        Name = '决策：命中 ＋ 有缓存 ⇒ ⇒ tap-cached（零 dump ⇒ ⇒ 抢得回 6 秒窗口）'
        Ok = ((Get-ConfirmTapPlan -FocusLine $focusDialog -HasCached $true -SlowDue $false) -eq 'tap-cached')
        Detail = '第二次弹窗（安装重试）⇒ ⇒ 不许再花 2–4 秒去 dump'
    }
    $cases += [pscustomobject]@{
        Name = '决策：命中 ＋ 无缓存 ⇒ ⇒ resolve（慢路径解析一次坐标）'
        Ok = ((Get-ConfirmTapPlan -FocusLine $focusDialog -HasCached $false -SlowDue $false) -eq 'resolve')
        Detail = '第一次命中 ⇒ ⇒ 解析一次 ⇒ ⇒ 缓存起来'
    }
    $cases += [pscustomobject]@{
        Name = '决策：没命中 ＋ 兜底到期 ⇒ ⇒ slow-scan（**不会漏**）'
        Ok = ((Get-ConfirmTapPlan -FocusLine $focusSettings -HasCached $true -SlowDue $true) -eq 'slow-scan')
        Detail = '认不认得焦点都扫一遍 ⇒ ⇒ 认不出的机型也不漏'
    }
    $cases += [pscustomobject]@{
        Name = '决策：没命中 ＋ 兜底没到期 ⇒ ⇒ wait'
        Ok = ((Get-ConfirmTapPlan -FocusLine $focusOwn -HasCached $true -SlowDue $false) -eq 'wait')
        Detail = '什么都不做 ⇒ ⇒ 继续轮询'
    }

    foreach ($c in $cases) { if (-not $c.Ok) { $ok = $false; $failures += $c.Name } }
    return [pscustomobject]@{ Ok = $ok; Cases = $cases; Failures = $failures }
}
