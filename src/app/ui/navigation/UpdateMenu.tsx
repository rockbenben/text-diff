"use client";
import React from "react";
import { Button, Dropdown, Flex, Switch, Typography, theme } from "antd";
import { SettingOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import { useAutoUpdatePreference, useUpdateCheck } from "@/app/hooks/useAutoUpdate";

// Where the update controls live, and why.
//
// The app has no settings page and no settings dialog: every tool in this
// family is a single-purpose surface, and a modal with one switch in it
// would be a heavier container than the feature deserves. The header is the
// app's only persistent chrome, and it already carries the app-level
// preferences (language, theme) — the update preference is the same kind of
// thing, so it belongs next to them.
//
// The controls are desktop-only: the updater does not exist in the browser,
// so on the web the whole entry is hidden rather than offering a button that
// could only fail.
export function UpdateMenu() {
  const t = useTranslations("Update");
  const { token } = theme.useToken();
  const [autoCheck, setAutoCheck] = useAutoUpdatePreference();
  const { checkNow, checking } = useUpdateCheck();

  const panel = (
    <div
      style={{
        width: 300,
        maxWidth: "80vw",
        padding: 16,
        backgroundColor: token.colorBgElevated,
        borderRadius: token.borderRadiusLG,
        boxShadow: token.boxShadowSecondary,
      }}>
      <Flex vertical gap={12}>
        <div>
          <Flex justify="space-between" align="center" gap={12}>
            <span>{t("autoCheck")}</span>
            <Switch checked={autoCheck} onChange={setAutoCheck} aria-label={t("autoCheck")} />
          </Flex>
          <Typography.Paragraph type="secondary" style={{ margin: 0, marginTop: 4, fontSize: 12 }}>
            {t("autoCheckHint")}
          </Typography.Paragraph>
        </div>
        <Button onClick={checkNow} loading={checking} block>
          {t("checkNow")}
        </Button>
      </Flex>
    </div>
  );

  return (
    <Dropdown trigger={["click"]} placement="bottomRight" destroyOnHidden menu={{ items: [] }} popupRender={() => panel}>
      <Button type="text" icon={<SettingOutlined style={{ fontSize: 18 }} />} aria-label={t("settings")} />
    </Dropdown>
  );
}

export default UpdateMenu;
