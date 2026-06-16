"use client";

import React from "react";
import { DiffOutlined } from "@ant-design/icons";
import { useTranslations } from "next-intl";
import ToolPage from "@/app/components/styled/ToolPage";
import TextDiff from "./TextDiff";

const ClientPage = () => {
  const t = useTranslations("TextDiff");
  return (
    <ToolPage icon={<DiffOutlined />} toolKey="textDiff" description={t("clientDescription")}>
      <TextDiff />
    </ToolPage>
  );
};

export default ClientPage;
