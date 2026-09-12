/**
 * Universal OPC FREEDOM Multi-Agent DAG Entity & Action Schema Registry
 * Mapping 16 SOP Modules, Commands, Inputs & Outputs for Autonomous DAG Workflows.
 */

export const SYSTEM_ENTITY_MATRIX = {
  ENTITY_FB_ADS: {
    id: 'ENTITY_FB_ADS',
    name: 'Facebook Ads Module',
    commands: {
      fb_get_campaign_report: {
        description: 'Lấy báo cáo chỉ số Facebook Ads',
        inputs: ['date_range', 'campaign_id'],
        outputs: ['spend', 'impressions', 'clicks', 'ctr', 'cpa', 'roas']
      },
      fb_update_budget: {
        description: 'Cập nhật ngân sách Facebook Ads',
        inputs: ['campaign_id', 'new_budget'],
        outputs: ['status_success']
      },
      fb_scale_budget_percent: {
        description: 'Tăng/Giảm ngân sách Facebook Ads theo phần trăm',
        inputs: ['percent_increase'],
        outputs: ['new_budget', 'status_success']
      },
      fb_toggle_campaign: {
        description: 'Bật/Tắt chiến dịch Facebook Ads',
        inputs: ['campaign_id', 'status'],
        outputs: ['status']
      }
    }
  },

  ENTITY_GG_ADS: {
    id: 'ENTITY_GG_ADS',
    name: 'Google Ads Module',
    commands: {
      gg_get_search_report: {
        description: 'Lấy báo cáo từ khóa Google Search Ads',
        inputs: ['gaql_query', 'date_range'],
        outputs: ['cost', 'conversions', 'cpc', 'quality_score']
      },
      gg_update_keyword_bid: {
        description: 'Điều chỉnh giá thầu từ khóa Google Ads',
        inputs: ['keyword_id', 'new_bid'],
        outputs: ['status']
      }
    }
  },

  ENTITY_CRM_LEAD: {
    id: 'ENTITY_CRM_LEAD',
    name: 'CRM & Customer Profile Module',
    commands: {
      crm_upsert_lead: {
        description: 'Tạo hoặc cập nhật Hồ sơ Khách hàng CRM',
        inputs: ['customer_phone', 'name', 'source', 'tags', 'notes'],
        outputs: ['lead_id', 'customer_profile_object']
      },
      crm_update_status: {
        description: 'Cập nhật trạng thái phễu khách hàng',
        inputs: ['lead_id', 'status'],
        outputs: ['updated_lead']
      },
      crm_assign_tracking_id: {
        description: 'Cấp mã Tracking ID cho từng Pháp nhân (HKD/DN)',
        inputs: ['legal_entity_name', 'tax_id'],
        outputs: ['tracking_id']
      },
      meeting_weekly_tracker: {
        description: 'Báo cáo họp tuần 3 chỉ số chính (Doanh số - Vấn đề - Kế hoạch)',
        inputs: ['tracking_id', 'revenue', 'issues', 'next_week_plan'],
        outputs: ['weekly_report_id']
      }
    }
  },

  ENTITY_ORDER_PRODUCT: {
    id: 'ENTITY_ORDER_PRODUCT',
    name: 'Orders & Product Inventory Module',
    commands: {
      order_create: {
        description: 'Khởi tạo Đơn hàng mới',
        inputs: ['customer_id', 'items', 'shipping_address'],
        outputs: ['order_id', 'total_amount']
      },
      order_get_weekly_growth: {
        description: 'Tính tỷ lệ % tăng trưởng đơn hàng theo cửa sổ thời gian',
        inputs: ['time_window_days'],
        outputs: ['growth_percent', 'this_period_orders', 'last_period_orders']
      },
      inventory_check_stock: {
        description: 'Kiểm tra tồn kho sản phẩm SKU',
        inputs: ['sku'],
        outputs: ['in_stock_qty', 'is_available']
      }
    }
  },

  ENTITY_WEB_OS_AUTOMATION: {
    id: 'ENTITY_WEB_OS_AUTOMATION',
    name: 'Web Browser & OS Level Automation Engine',
    commands: {
      tool_execute: {
        description: 'Kích hoạt quy trình tự động hóa trình duyệt',
        inputs: ['tool_id', 'profile_name', 'inputs_json', 'headless_flag'],
        outputs: ['scraped_data_json', 'execution_status', 'screenshot_path']
      },
      os_file_rename: {
        description: 'Đổi tên tệp tin hệ điều hành OS',
        inputs: ['old_path', 'new_path'],
        outputs: ['new_file_path']
      },
      os_file_upload_picker: {
        description: 'Tự động chọn tệp tin máy tính đẩy lên website',
        inputs: ['file_path', 'target_selector'],
        outputs: ['upload_status']
      },
      os_desktop_screenshot: {
        description: 'Chụp ảnh màn hình Desktop',
        inputs: [],
        outputs: ['desktop_image_path']
      }
    }
  },

  ENTITY_FINANCE_PAYMENT: {
    id: 'ENTITY_FINANCE_PAYMENT',
    name: 'Finance & Payment Module',
    commands: {
      payment_generate_widget: {
        description: 'Tạo nút/widget thanh toán Stripe hay PayPal',
        inputs: ['amount', 'currency', 'order_id', 'gate'],
        outputs: ['payment_url', 'widget_html']
      },
      payment_generate_qr: {
        description: 'Tạo mã QR thanh toán ngân hàng động VietQR/MBBank',
        inputs: ['amount', 'member_id', 'resource_sku'],
        outputs: ['qr_code_url', 'transaction_code']
      },
      webhook_listen_payment: {
        description: 'Lắng nghe tín hiệu chuyển khoản thành công từ ngân hàng',
        inputs: ['transaction_code'],
        outputs: ['payment_received', 'received_amount']
      },
      finance_calculate_net_profit: {
        description: 'Tính toán Lợi nhuận Ròng (Revenue - Ads - COGS)',
        inputs: ['start_date', 'end_date'],
        outputs: ['net_profit', 'margin_percent']
      },
      finance_record_fee: {
        description: 'Ghi nhận đóng phí thành viên (Đợt 1 / Đợt 2 / Gia hạn)',
        inputs: ['member_id', 'amount', 'fee_type'],
        outputs: ['receipt_id', 'activated_at']
      },
      finance_process_refund: {
        description: 'Xử lý hoàn tiền Refund 100% trong 30 ngày',
        inputs: ['receipt_id', 'reason'],
        outputs: ['refund_status', 'refund_amount']
      },
      finance_transfer_to_main_fund: {
        description: 'Chuyển tiền vào Quỹ vận hành chính thức sau 30 ngày',
        inputs: ['receipt_id'],
        outputs: ['fund_status']
      },
      finance_record_revenue: {
        description: 'Ghi nhận tổng doanh thu phí thành viên trong tháng',
        inputs: ['month'],
        outputs: ['total_revenue']
      },
      finance_allocate_funds_20_30_10_40: {
        description: 'Trích lập 4 Quỹ: 20% Thưởng, 30% Mentor, 10% Affiliate, 40% BQT',
        inputs: ['total_revenue'],
        outputs: ['reward_fund_20', 'mentor_fund_30', 'affiliate_fund_10', 'bqt_fund_40']
      },
      finance_payout_affiliate_mentor_bqt: {
        description: 'Chi trả tự động cho Mentor, Affiliate và Hạ tầng BQT',
        inputs: ['payout_matrix'],
        outputs: ['payout_status']
      },
      finance_disburse_reward_20percent: {
        description: 'Giải ngân 20% Quỹ thưởng cho Top cống hiến',
        inputs: ['winner_ids', 'group_name', 'week'],
        outputs: ['disbursement_receipts']
      },
      finance_process_renewal_50_10_40: {
        description: 'Xử lý gia hạn thành viên 50-10-40 và cập nhật đóng góp quỹ tuần',
        inputs: ['member_id', 'amount', 'renewed_weeks_remaining'],
        outputs: ['reward_fund_50', 'affiliate_fund_10', 'bqt_fund_40', 'weekly_contribution']
      },
      finance_revenue_split_60_40: {
        description: 'Chia sẻ doanh thu may đo: 60% Dev, 40% Quỹ chung',
        inputs: ['ticket_id'],
        outputs: ['split_success', 'total_fee', 'dev_share_amount', 'system_share_amount', 'dev_id']
      }
    }
  },

  ENTITY_CHAT_CONSULT: {
    id: 'ENTITY_CHAT_CONSULT',
    name: 'Live Chat & Customer Consultation',
    commands: {
      chat_send_message: {
        description: 'Gửi tin nhắn tư vấn đa kênh Zalo/FB/Telegram',
        inputs: ['channel', 'recipient_id', 'text', 'media_urls'],
        outputs: ['sent_status']
      },
      chat_parse_intent: {
        description: 'Phân tích ý định câu hội thoại của khách',
        inputs: ['message_text'],
        outputs: ['intent', 'entities_extracted']
      }
    }
  },

  ENTITY_FOLLOWUP: {
    id: 'ENTITY_FOLLOWUP',
    name: 'Active Pursuit & FollowUp Module',
    commands: {
      followup_schedule_pursuit: {
        description: 'Lập lịch bám đuổi tự động khách hàng',
        inputs: ['lead_id', 'delay_minutes', 'sequence_template_id'],
        outputs: ['schedule_id']
      }
    }
  },

  ENTITY_CME_CONTENT: {
    id: 'ENTITY_CME_CONTENT',
    name: 'Content Marketing Engine (CME)',
    commands: {
      cme_generate_content: {
        description: 'AI sáng tạo bài viết nội dung marketing',
        inputs: ['topic', 'target_audience', 'tone', 'format'],
        outputs: ['draft_text', 'suggested_images']
      },
      cme_verify_campaign_content: {
        description: 'Kiểm duyệt và đối soát nội dung theo chính sách nền tảng và luật quảng cáo',
        inputs: ['content_ids'],
        outputs: ['verified_contents', 'verification_status', 'violations']
      }
    }
  },

  ENTITY_CHANNEL_DISPATCH: {
    id: 'ENTITY_CHANNEL_DISPATCH',
    name: 'Channel Dispatcher Module',
    commands: {
      channel_publish_post: {
        description: 'Xuất bản bài viết lên các kênh Social Media / Biztada',
        inputs: ['content_object', 'channels'],
        outputs: ['published_urls_map']
      },
      channel_get_engagement_report: {
        description: 'Đo lường chỉ số Reach, Impression, Conversion Rate',
        inputs: ['time_window'],
        outputs: ['reach_rate', 'conversion_rate']
      }
    }
  },

  ENTITY_DAG_CRON: {
    id: 'ENTITY_DAG_CRON',
    name: 'DAG Cron & Execution Triggers',
    commands: {
      cron_schedule_dag: {
        description: 'Đặt lịch chạy luồng DAG theo biểu thức Cron',
        inputs: ['dag_id', 'cron_expression'],
        outputs: ['cron_job_id']
      },
      cron_track_30days: {
        description: 'Đếm ngược 30 ngày thử thách chính sách Refund',
        inputs: ['receipt_id'],
        outputs: ['days_elapsed']
      }
    }
  },

  ENTITY_KNOWLEDGE_MEM0: {
    id: 'ENTITY_KNOWLEDGE_MEM0',
    name: 'Knowledge Ingestion & Mem0 Engine',
    commands: {
      knowledge_passive_ingest: {
        description: 'Nạp tri thức thụ động từ hội thoại khách hàng',
        inputs: ['customer_id', 'conversation_transcript'],
        outputs: ['memory_ids']
      },
      knowledge_active_ingest: {
        description: 'Nạp tri thức chủ động từ tệp tin/URL cho Agent',
        inputs: ['file_path_or_url', 'domain_category'],
        outputs: ['knowledge_doc_id']
      }
    }
  },

  ENTITY_WEB_ARCHITECT: {
    id: 'ENTITY_WEB_ARCHITECT',
    name: 'Web Architect Studio Module',
    commands: {
      web_generate_landing_page: {
        description: 'AI thiết kế và sinh mã Landing Page',
        inputs: ['prompt', 'product_info'],
        outputs: ['html_code', 'assets_folder']
      },
      web_deploy_cloudflare: {
        description: 'Đẩy Landing Page lên Cloudflare Workers/Pages',
        inputs: ['project_name', 'html_code'],
        outputs: ['live_url']
      }
    }
  },

  ENTITY_ESCALATION: {
    id: 'ENTITY_ESCALATION',
    name: 'Human-in-the-Loop & Escalation Engine',
    commands: {
      escalate_to_human: {
        description: 'Đẩy thông báo khẩn cấp lên Telegram Bot cho người chủ',
        inputs: ['reason', 'context_data'],
        outputs: ['escalation_status']
      },
      mtb_send_dag_proposal: {
        description: 'Gửi đề xuất sơ đồ DAG cho người chủ duyệt',
        inputs: ['dag_schema_json'],
        outputs: ['proposal_message_id']
      }
    }
  },

  ENTITY_MEMBER_LIFECYCLE: {
    id: 'ENTITY_MEMBER_LIFECYCLE',
    name: 'OPC Member Lifecycle & Roadmap Module',
    commands: {
      member_onboard: {
        description: 'Kích hoạt tài khoản & gán Mentor đợt 1',
        inputs: ['member_id', 'fee_amount'],
        outputs: ['folder_id', 'mentor_id']
      },
      member_verify_milestone: {
        description: 'Xác nhận nghiệm thu các mốc lộ trình 1 năm',
        inputs: ['member_id', 'week_number'],
        outputs: ['is_completed']
      },
      member_check_payment_due: {
        description: 'Kiểm tra trạng thái phí đóng Đợt 2 (Tháng 6)',
        inputs: ['member_id'],
        outputs: ['is_paid', 'due_days']
      },
      mentor_review_step: {
        description: 'Mentor thẩm định và nghiệm thu bước lộ trình (1-7)',
        inputs: ['member_id', 'step_number', 'mentor_id'],
        outputs: ['is_approved']
      },
      weekly_attendance_audit: {
        description: 'Quét và chấm điểm danh tham gia họp Weekly & nộp bài theo nhóm',
        inputs: ['member_id', 'member_group'],
        outputs: ['is_warning', 'missed_weeks']
      },
      bqt_review_exit: {
        description: 'Ban Quản Trị thẩm định phương án dừng/duy trì/M&A ở Bước 9',
        inputs: ['member_id', 'bqt_id'],
        outputs: ['exit_approved', 'exit_method']
      },
      member_verify_status: {
        description: 'Kiểm tra trạng thái Active / Auto-Lock của thành viên',
        inputs: ['member_id'],
        outputs: ['is_active', 'status']
      },
      member_auto_lock: {
        description: 'Tự động khóa Token AI Agent, VPS và xóa khỏi Chat Group',
        inputs: ['member_id'],
        outputs: ['tokens_revoked', 'vps_shutdown', 'chat_group_kicked']
      },
      member_unlock_5min: {
        description: 'Mở lại toàn bộ quyền truy cập hạ tầng trong 5 phút',
        inputs: ['member_id', 'payment_receipt'],
        outputs: ['tokens_restored', 'vps_restarted']
      },
      trigger_sub_dag: {
        description: 'Kích hoạt một luồng sub-DAG độc lập khác (Ví dụ: Trọng tài / Khiếu nại)',
        inputs: ['member_id', 'sub_dag_id'],
        outputs: ['success']
      },
      member_deactivate: {
        description: 'Đóng hồ sơ & thu hồi hạ tầng khi dừng tham gia (STOP)',
        inputs: ['member_id'],
        outputs: ['account_closed']
      },
      member_renew_13m: {
        description: 'Gia hạn năm thứ 2 trở đi (13 triệu/năm)',
        inputs: ['member_id'],
        outputs: ['renewed_until_year_2']
      },
      bot_send_reminders_15_7_3d: {
        description: 'Tự động gửi tin nhắn nhắc nợ đóng phí đợt 2 trước 15, 7, 3 ngày',
        inputs: ['member_id', 'due_days'],
        outputs: ['message_status']
      }
    }
  },

  ENTITY_RESOURCE_STORE: {
    id: 'ENTITY_RESOURCE_STORE',
    name: 'Member Resource Marketplace Engine',
    commands: {
      resource_deliver_key: {
        description: 'Cấp phát tự động mã Key / Link tài nguyên giá sỉ',
        inputs: ['member_id', 'resource_sku'],
        outputs: ['license_key', 'access_url']
      }
    }
  },

  ENTITY_MARKETPLACE_CONTRIBUTION: {
    id: 'ENTITY_MARKETPLACE_CONTRIBUTION',
    name: 'Marketplace Contribution & Sandbox Pipeline Engine',
    commands: {
      marketplace_receive_candidate: {
        description: 'Tiếp nhận hồ sơ đề xuất DAG/SOP từ Thành viên nộp lên',
        inputs: ['candidate_id', 'member_id', 'dag_json', 'description', 'niche_category'],
        outputs: ['candidate_id', 'member_id', 'dag_json', 'description', 'niche_category', 'status']
      },
      marketplace_ai_preaudit: {
        description: 'AI Pre-audit bóc tách biến số hardcoded và chuẩn hóa Template DAG',
        inputs: ['candidate_id', 'dag_json'],
        outputs: ['candidate_id', 'dag_name', 'sanitized_dag', 'variables_detected', 'audit_summary', 'preaudit_passed']
      },
      marketplace_generate_spec: {
        description: 'Tự động sinh tài liệu đặc tả kỹ thuật Markdown cho DAG',
        inputs: ['candidate_id', 'sanitized_dag', 'audit_summary'],
        outputs: ['candidate_id', 'spec_markdown', 'generated_at']
      },
      marketplace_forward_core: {
        description: 'Chuyển tiếp hồ sơ lên hàng đợi Core HQ Sandbox để quét an ninh và ký số xuất bản',
        inputs: ['candidate_id', 'sanitized_dag', 'spec_markdown'],
        outputs: ['candidate_id', 'forwarded_to_core', 'core_ticket_id', 'status']
      }
    }
  },

  ENTITY_TRUMVPS_CLOUD: {
    id: 'ENTITY_TRUMVPS_CLOUD',
    name: 'TrumVPS Cloud Infrastructure Module',
    commands: {
      member_verify_legal: {
        description: 'Xác minh thông tin 02 nhân sự cố định của Pháp nhân',
        inputs: ['member_id'],
        outputs: ['company_tax_code', 'contact_emails']
      },
      vps_provision_instance: {
        description: 'Khởi tạo VPS Ubuntu Desktop / Docker AI trên TrumVPS',
        inputs: ['member_id', 'os_type', 'specs'],
        outputs: ['ip_address', 'username', 'password']
      },
      vps_monitor_health: {
        description: 'Giám sát dung lượng CPU, RAM, Storage của VPS',
        inputs: ['ip_address'],
        outputs: ['cpu_usage', 'ram_usage', 'storage_usage']
      },
      vps_toggle_status: {
        description: 'Bật/Tắt hoặc tạm ngắt dịch vụ VPS',
        inputs: ['ip_address', 'action'],
        outputs: ['vps_status']
      },
      vps_get_details: {
        description: 'Lấy thông tin chi tiết VPS bao gồm IP và GitHub repository liên kết',
        inputs: ['member_id'],
        outputs: ['ip_address', 'github_repo_url', 'vps_status']
      },
      vps_test_and_link_github: {
        description: 'Kiểm thử phân quyền Đọc/Ghi/Xóa trên GitHub và lưu liên kết repository của thành viên',
        inputs: ['member_id', 'github_repo_url'],
        outputs: ['test_success', 'github_repo_url', 'message']
      }
    }
  },

  ENTITY_CREDIT_EVAL: {
    id: 'ENTITY_CREDIT_EVAL',
    name: 'Credit, Pitchdeck & Finance Model Audit Module',
    commands: {
      credit_check_nationality: {
        description: 'Kiểm tra phân loại quốc tịch Việt Nam hoặc Quốc tế',
        inputs: ['member_id'],
        outputs: ['nationality']
      },
      credit_collect_cic_md: {
        description: 'Thu thập báo cáo CIC cá nhân & tổ chức định dạng .md',
        inputs: ['member_id', 'nationality'],
        outputs: ['cic_member_file', 'cic_organization_file']
      },
      credit_collect_project_docs_md: {
        description: 'Thu thập/Cập nhật Pitchdeck, Finance Model & Business Plan định dạng .md cho tổ chức',
        inputs: ['member_id'],
        outputs: ['pitchdeck_file', 'finance_model_file', 'business_plan_file']
      },
      credit_ingest_cic: {
        description: 'Thu thập & Phân tích Báo cáo Tín dụng CIC',
        inputs: ['member_id', 'cic_file_path'],
        outputs: ['credit_score', 'bad_debt_group']
      },
      credit_audit_finance_model: {
        description: 'Thẩm định tính khả thi của Finance Model & Pitchdeck',
        inputs: ['finance_model_excel'],
        outputs: ['feasibility_score', 'logic_errors']
      },
      consult_debt_handling: {
        description: 'Tư vấn phương án xử lý nợ xấu cho doanh nghiệp',
        inputs: ['member_id', 'bad_debt_group'],
        outputs: ['debt_strategy_doc']
      },
      build_data_folder: {
        description: 'Đóng gói Data Folder Tín dụng mã hóa',
        inputs: ['member_id', 'pitchdeck', 'finance_model'],
        outputs: ['encrypted_data_folder_url']
      },
      credit_screen_data_folder: {
        description: 'Sàng lọc hồ sơ tín dụng cho các nguồn vốn',
        inputs: ['encrypted_data_folder_url'],
        outputs: ['funding_type_eligible']
      },
      capital_submit_folder: {
        description: 'Chuyển Data Folder sang Ngân hàng / Quỹ liên kết',
        inputs: ['tracking_id', 'target_source'],
        outputs: ['submission_status']
      },
      capital_execute_pitching: {
        description: 'Tổ chức Pitching nội bộ gọi vốn cộng đồng hoặc Quỹ',
        inputs: ['funding_type', 'data_folder_url'],
        outputs: ['disbursement_status', 'disbursed_amount']
      },
      capital_collect_commission: {
        description: 'Thu phí hoa hồng giải ngân vốn thành công',
        inputs: ['tracking_id', 'disbursed_amount'],
        outputs: ['commission_amount', 'receipt_id']
      },
      capital_track_payout_commission: {
        description: 'Theo dõi tiến độ giải ngân & tính hoa hồng giải ngân',
        inputs: ['tracking_id', 'disbursed_amount'],
        outputs: ['commission_amount', 'receipt_id']
      },
      financial_extract_member_data: {
        description: 'Trích xuất thu chi từ hệ thống clone của thành viên',
        inputs: ['member_id', 'project_name'],
        outputs: ['member_id', 'project_name', 'income', 'expense', 'net_profit']
      },
      financial_consolidate_report: {
        description: 'Hợp nhất dữ liệu báo cáo tài chính lên trung tâm',
        inputs: ['member_id', 'project_name', 'income', 'expense', 'net_profit'],
        outputs: ['member_id', 'project_name', 'income', 'expense', 'net_profit']
      },
      financial_publish_dashboard: {
        description: 'Công khai thông tin dự án lên bảng gọi vốn M&A',
        inputs: ['member_id', 'project_name'],
        outputs: ['published', 'project_name', 'contact_phone']
      },
      capital_publish_deal: {
        description: 'Đăng hồ sơ gọi vốn lên pool đối tác tài chính',
        inputs: ['member_id', 'data_folder_url'],
        outputs: ['deal_id', 'status']
      },
      capital_wait_for_partner_bid: {
        description: 'Chờ đối tác tài chính thầu và thành viên phê duyệt',
        inputs: ['deal_id'],
        outputs: ['is_approved', 'selected_partner_id', 'agreed_amount', 'commission_amount', 'expected_days', 'funding_type']
      },
      capital_wait_for_disbursement_deadline: {
        description: 'Chờ giải ngân hoặc quá hạn giải ngân',
        inputs: ['deal_id', 'deadline_days'],
        outputs: ['is_disbursed']
      },
      capital_close_deal_success: {
        description: 'Đóng hồ sơ gọi vốn thành công',
        inputs: ['deal_id'],
        outputs: ['success']
      },
      capital_execute_deal_failed_refund: {
        description: 'Xử lý phạt đối tác, hoàn tiền 5% và chạy lại đấu thầu',
        inputs: ['deal_id'],
        outputs: ['success', 'refund_order_id']
      }
    }
  },

  ENTITY_ARBITRATION_COUNCIL: {
    id: 'ENTITY_ARBITRATION_COUNCIL',
    name: 'Arbitration Council & Mentor Dispute Resolution',
    commands: {
      arbitration_submit_ticket: {
        description: 'Nộp đơn khiếu nại Mentor trong vòng 24h',
        inputs: ['member_id', 'mentor_id', 'reason', 'recording_url'],
        outputs: ['ticket_id']
      },
      arbitration_collect_evidence: {
        description: 'Thu thập giải trình đối chất của Mentor trong vòng 24h',
        inputs: ['ticket_id', 'mentor_id', 'timeout_hours'],
        outputs: ['evidence_collected']
      },
      arbitration_select_judges: {
        description: 'Thành lập Hội đồng Trọng tài BQT',
        inputs: ['ticket_id'],
        outputs: ['judges']
      },
      debate_council_review_transcript: {
        description: 'Hội đồng Trọng tài AI đối soát ghi âm và bài tập',
        inputs: ['ticket_id', 'recording_url'],
        outputs: ['verdict', 'confidence_score']
      },
      arbitration_council_vote: {
        description: 'BQT bỏ phiếu phán quyết trọng tài',
        inputs: ['ticket_id', 'judges', 'ai_suggestion'],
        outputs: ['final_verdict']
      },
      arbitration_execute_penalty: {
        description: 'Thi hành phán quyết Trọng tài',
        inputs: ['ticket_id', 'member_id', 'mentor_id', 'disputed_step', 'verdict'],
        outputs: ['penalty_executed', 'verdict_applied']
      },
      mentor_hold_24h_check: {
        description: 'Kiểm tra xem buổi học có đang bị khiếu nại trong 24h',
        inputs: ['session_id'],
        outputs: ['is_disputed']
      }
    }
  },

  ENTITY_DATA_SECURITY: {
    id: 'ENTITY_DATA_SECURITY',
    name: 'Data Protection & NDA Compliance Engine',
    commands: {
      nda_send_esignature: {
        description: 'Gửi Hợp đồng Bảo mật NDA điện tử',
        inputs: ['member_id', 'contact_emails'],
        outputs: ['nda_signed_status', 'nda_doc_hash']
      },
      folder_set_permissions: {
        description: 'Phân quyền thư mục Data Folder theo cấp bậc',
        inputs: ['folder_id', 'allowed_user_ids'],
        outputs: ['access_control_status']
      },
      crypto_encrypt_data: {
        description: 'Mã hóa tài liệu CIC, Pitchdeck, Finance Model',
        inputs: ['data_path'],
        outputs: ['encrypted_path']
      },
      audit_log_scan: {
        description: 'Quét log truy cập phát hiện nhân sự lạ',
        inputs: ['folder_id'],
        outputs: ['unauthorized_access_detected']
      }
    }
  },

  ENTITY_COMMUNITY_POLL: {
    id: 'ENTITY_COMMUNITY_POLL',
    name: 'Community Contribution & Blind Poll Engine',
    commands: {
      tracker_aggregate_contributions: {
        description: 'Thống kê chỉ số tương tác hỗ trợ đồng đội trong tháng',
        inputs: ['month'],
        outputs: ['top_contributors_list']
      },
      poll_open_blind_vote: {
        description: 'Mở cổng Bỏ phiếu kín toàn Cộng đồng vào cuối tháng',
        inputs: ['candidates_list'],
        outputs: ['poll_id']
      },
      poll_tally_votes: {
        description: 'Kiểm phiếu tự động & xếp hạng cống hiến',
        inputs: ['poll_id'],
        outputs: ['winner_ids']
      }
    }
  },

  ENTITY_MNA_EXCHANGE: {
    id: 'ENTITY_MNA_EXCHANGE',
    name: 'Internal M&A Business Exchange Engine',
    commands: {
      meeting_review_4hours: {
        description: 'Họp Review 4h phân tích chỉ số tài chính sau 6-12 tháng',
        inputs: ['member_id', 'financial_report'],
        outputs: ['exit_decision']
      },
      mna_list_on_exchange: {
        description: 'Đưa Hồ sơ Doanh nghiệp/HKD lên Sàn Nội bộ định giá để bán lại',
        inputs: ['member_id', 'valuation_amount'],
        outputs: ['listing_id']
      }
    }
  },

  ENTITY_IT_CUSTOMIZATION: {
    id: 'ENTITY_IT_CUSTOMIZATION',
    name: 'IT Customization & Ticket Service Engine',
    commands: {
      ticket_receive_request: {
        description: 'Tiếp nhận Ticket yêu cầu may đo phần mềm từ khách hàng',
        inputs: ['user_id', 'description'],
        outputs: ['ticket_id']
      },
      ai_estimate_scope_and_fee: {
        description: 'Ước tính số giờ và giá cọc 50%',
        inputs: ['complexity_level', 'estimated_hours', 'base_rate_per_hour'],
        outputs: ['deposit_amount', 'total_fee']
      },
      task_assign_dev_private_channel: {
        description: 'Mở kênh làm việc riêng tư giữa User và Dev/Mentor',
        inputs: ['ticket_id', 'dev_id'],
        outputs: ['private_channel_id']
      },
      auto_run_sandbox_tests: {
        description: 'Chạy bộ kiểm thử Sandbox E2E nghiệm thu tính năng mới',
        inputs: ['ticket_id'],
        outputs: ['test_status', 'pass_rate']
      },
      payment_collect_remaining_50: {
        description: 'Thu 50% còn lại và đóng Ticket',
        inputs: ['amount', 'ticket_id'],
        outputs: ['payment_receipt', 'ticket_closed']
      },
      ticket_wait_for_bid_approval: {
        description: 'Tạm dừng chờ Lập trình viên đấu thầu và Thành viên phê duyệt',
        inputs: ['ticket_id'],
        outputs: ['assigned_dev_id', 'total_fee', 'deposit_amount']
      },
      payment_wait_for_deposit: {
        description: 'Tạm dừng chờ hệ thống xác nhận thanh toán đặt cọc 50%',
        inputs: ['ticket_id'],
        outputs: ['deposit_received']
      }
    }
  },

  ENTITY_PUSH_COMMUNICATION: {
    id: 'ENTITY_PUSH_COMMUNICATION',
    name: 'Push Communication & Anti-Spam Module',
    commands: {
      crm_filter_push_audience: {
        description: 'Lọc và phân nhóm khách hàng (Chưa định danh SĐT, Đã định danh SĐT, Thành viên tự do)',
        inputs: ['campaign_id', 'skip_unidentified_no_contact'],
        outputs: ['unidentified_leads', 'identified_leads', 'membership_users']
      },
      push_route_unidentified_leads: {
        description: 'Định tuyến tin nhắn cho lead chưa định danh SĐT qua Zalo/FB/Telegram/Email',
        inputs: ['audience_list', 'channel_priority'],
        outputs: ['queue']
      },
      push_route_identified_fallback: {
        description: 'Định tuyến tin nhắn cho lead đã có SĐT theo fallback: Telegram -> Zalo -> FB -> Email',
        inputs: ['audience_list', 'channel_priority'],
        outputs: ['queue']
      },
      push_route_membership_channel: {
        description: 'Định tuyến cho thành viên dựa trên lịch sử tương tác 30 ngày trong DB',
        inputs: ['audience_list', 'message_type'],
        outputs: ['queue']
      },
      push_merge_message_queues: {
        description: 'Gộp các hàng chờ tin nhắn từ các phân khúc đối tượng',
        inputs: ['queues'],
        outputs: ['merged_queue']
      },
      push_smart_queue_dispatch: {
        description: 'Bắn tin nhắn thông minh (chống spam, tản giờ, giả lập gõ phím, SMTP/Resend API)',
        inputs: ['queue_list', 'frequency_cap', 'human_typing_delay'],
        outputs: ['dispatch_results_map']
      }
    }
  },

  ENTITY_WEEKLY_MEETING_OPERATIONS: {
    id: 'ENTITY_WEEKLY_MEETING_OPERATIONS',
    name: 'Weekly Community Meeting Operations Module (SOP-20)',
    commands: {
      meeting_register_member: {
        description: 'Đăng ký hoặc gia hạn thành viên vào danh sách họp tuần 52 tuần',
        inputs: ['member_id', 'member_group', 'entry_source', 'valid_weeks'],
        outputs: ['registered', 'member_id', 'valid_weeks']
      },
      weekly_attendance_audit: {
        description: 'Kiểm toán điểm danh chuyên cần qua 3 vấn đề nộp trước buổi họp',
        inputs: ['member_id', 'member_group', 'current_week'],
        outputs: ['consecutive_absent', 'is_warning', 'is_auto_lock', 'has_submitted', 'accumulated_weeks', 'attendance_rate', 'next_week']
      },
      meeting_absence_remediation: {
        description: 'Xử lý cảnh báo vắng họp tuần (2 tuần cảnh báo, 3 tuần khóa tài khoản)',
        inputs: ['member_id', 'consecutive_absent'],
        outputs: ['consecutive_absent', 'remediation_level', 'notified']
      },
      live_meeting_moderate_cycle: {
        description: 'Điều phối phiên họp trực tiếp Zero-Human-Host (Limit 3 giải pháp/vấn đề)',
        inputs: ['member_group', 'current_week'],
        outputs: ['session_id', 'total_problems', 'status']
      },
      weekly_cycle_standby: {
        description: 'Chờ đợi chu kỳ họp tuần tiếp theo',
        inputs: ['member_id', 'next_week'],
        outputs: ['standby_status']
      }
    }
  }
};

