// Arabic and English text. The choice is kept in this browser; the first visit follows the browser's language.
import { html } from './lib.js';

const LANG_KEY = 'building-fund-lang';

function initial() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    // Storage blocked: follow the browser's language.
  }
  return (navigator.language ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export const lang = initial();
document.documentElement.lang = lang;
document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

// Dates in Arabic month names but with the same digits as the amounts.
export const locale = () => (lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');

export function setLang(next) {
  try {
    localStorage.setItem(LANG_KEY, next);
  } catch {
    // Storage blocked: the language cannot be changed in this browser.
  }
  location.reload();
}

export function LangButton() {
  return html`<button type="button" class="btn small" onClick=${() => setLang(lang === 'ar' ? 'en' : 'ar')}>
    ${lang === 'ar' ? 'English' : 'العربية'}
  </button>`;
}

const en = {
  ok: 'OK', cancel: 'Cancel', save: 'Save', delete: 'Delete', deleted: 'Deleted', saved: 'Saved', loading: 'Loading…',
  not_found: 'Page not found.', home: 'Home', done: 'Done', print: 'Print', edit: 'Edit', open: 'Open', current: 'Open now',
  choose: 'Choose…', all: 'All', send: 'Send', copied: 'Copied', nothing_yet: 'Nothing here yet.',
  sign_in: 'Sign in', sign_out: 'Sign out', password: 'Password', email: 'Email',

  owes: '{n} due', advance: 'Paid ahead {n}', settled: 'Nothing owed', apt: 'Apt {n}',
  'k.due': 'Monthly fee', 'k.payment': 'Fee payment', 'k.bill': 'Bill paid by manager', 'k.bill_payment': 'Bill repaid',
  'k.expense': 'Expense', 'k.income': 'Other income',
  'cat.maintenance': 'Maintenance', 'cat.elevator': 'Elevator', 'cat.cleaning': 'Cleaning', 'cat.electricity': 'Electricity',
  'cat.water': 'Water', 'cat.gas': 'Gas', 'cat.salaries': 'Salaries', 'cat.other': 'Other',
  'st.open': 'Open', 'st.progress': 'In progress', 'st.done': 'Done',

  'err.wrong_login': 'Wrong building code, apartment or password.',
  'err.locked': 'Too many wrong passwords. Try again in 15 minutes.',
  'err.not_allowed': 'You are not allowed to do this.',
  'err.bad_input': 'Check the values and try again.',
  'err.bad_amount': 'Enter an amount above zero.',
  'err.too_many_buildings': 'You have already created 5 buildings, which is the limit.',
  'err.short_password': 'The password needs at least 4 characters.',
  'err.session_expired': 'Please sign in again.',
  'err.too_many_reports': 'You already have 5 open reports. Wait until the manager closes one.',
  'err.label_taken': 'Another apartment already has this number.',
  'err.Invalid login credentials': 'Wrong email or password.',

  resident: 'Resident', manager: 'Manager',
  building_code: 'Building code', apartment_number: 'Apartment number or code',
  resident_login_hint: 'Your building manager gives you the building code and your password.',
  demo_resident_hint: 'Demo: building DEMO01, any apartment from F1-R to F11-L, password 1234.',
  apt_hint: 'For example F3-R: floor 3, right. F3-L is the left one.',
  'k.extra': 'Extra fee', add_extra: 'Add extra fee', all_apartments: 'All apartments ({n})', extra_what: 'What is it for',
  extra_hint: 'A one-time charge on top of the monthly fee, for example for an upgrade project. It is added to what the apartment owes the building.',
  balance_now: 'Fee balance now',
  balance_now_hint: 'What the apartment owes in fees right now. Type the real figure to correct it: 1000 if it owes 1000, -400 if it has paid 400 ahead. Bills you paid for it are separate.',
  edit_all: 'Edit all', save_all: 'Save all',
  edit_all_hint: 'Change names, phones, monthly fees and balances for all apartments here. Balance: what the apartment owes in fees right now; use a minus sign for money paid ahead.',
  n_saved: '{n} apartments updated', nothing_changed: 'Nothing was changed.',
  whatsapp: 'WhatsApp',
  wa_msg: 'Hello, this is the building manager.\nApartment {apt} in {building}: {status}.\n\nYour account: {link}\nBuilding code: {code}\nApartment: {apt}\nPassword: {pw}',
  wa_no_password: 'For security, the app does not keep the password of apartment {n}, so it cannot be put in the message. Make a new password and send it? The old password stops working.',
  wa_new_password: 'New password and send',
  login_details: 'Sign-in name',
  password_hidden: 'For security, passwords are shown only once, when they are made. To give this resident their password again, press Password to set a new one.',
  statement_pdf: 'Statement PDF', report_pdf: 'Report (PDF)', pdf_download: 'Download PDF', pdf_making: 'Making the PDF…',
  pdf_failed: 'The PDF could not be made. Check the connection, or use Print and choose "Save as PDF".',
  rp_building_report: 'Building report', rp_statement_of: 'Statement of apartment {n}',
  rp_from_to: '{from} to {to}', rp_until: 'Everything up to {to}', rp_made_on: 'Made on {d}',
  rp_this_month: 'This month', rp_last_month: 'Last month', rp_this_year: 'This year', rp_all_time: 'All time',
  rp_from: 'From', rp_to: 'To',
  rp_period_totals: 'In this period', rp_now: 'Today', rp_net: 'In minus out', rp_bills_owed: 'Bills owed to the manager',
  rp_paid_period: 'Paid in period', rp_fee_balance: 'Fee balance', rp_total: 'Total', rp_movements: 'Building fund: money in and out',
  rp_item: 'Item', rp_in: 'In', rp_out: 'Out', rp_charged: 'Charged', rp_paid: 'Paid', rp_total_now: 'Total owed now',
  backups: 'Backup and restore',
  backups_hint: 'The app saves a copy of this building by itself once a day, on the days a manager opens it, and keeps the last 30. "Back up now" saves one more and downloads it as a file; keep that file somewhere safe from time to time.',
  backup_now: 'Back up now', restore_file: 'Restore from a file', restore: 'Restore', download: 'Download',
  backup_saved: 'Backup saved', no_backups: 'No backups yet.', show_all_n: 'Show all ({n})',
  backup_counts: '{units} apartments, {entries} entries',
  'bk.auto': 'Automatic', 'bk.manual': 'Made by a manager', 'bk.before_restore': 'Before a restore',
  confirm_restore: 'Go back to the backup of {when}?\n\nIt holds {units} apartments and {entries} entries. Apartments, balances, payments, bills and maintenance become what they were then; everything recorded after it is removed.\n\nThe building as it is now is saved first, so you can undo this.',
  restored: 'The backup was restored. The page will reload.',
  'err.bad_backup': 'This is not a backup file of this app.',
  'err.backup_other_building': 'This backup belongs to another building.',
  'err.no_connection': 'No connection.',
  'err.JWT expired': 'Your sign-in ran out. Close the app, open it again and sign in.',
  install_app: 'Install the app on this device',
  install_ios: 'To install: tap the Share button, then "Add to Home Screen".',
  numbering: 'Apartment names', numbering_coded: 'By floor: {x}', numbering_plain: 'Numbers: 1, 2, 3 …',
  rename_apartments: 'Rename apartments', rename_hint: 'Renames every apartment from its floor. Balances and passwords stay the same, but residents sign in with the new name.',
  rename_coded: 'Use floor codes (F1-R …)', rename_plain: 'Use numbers (1, 2, 3 …)',
  confirm_rename: 'Rename all apartments? Residents will sign in with the new names.',
  managers: 'Managers', managers_hint: 'Other managers can do everything you can, except add or remove managers and delete the building. They must create a manager account first.',
  owner: 'Owner', add_manager: 'Add manager', manager_email: 'Their email', remove: 'Remove',
  confirm_remove_manager: 'Remove {email} as a manager of this building?',
  'err.owner_only': 'Only the building owner can do this.',
  'err.no_account': 'No manager account uses this email. Ask them to create an account in the app first.',
  'err.too_many_managers': 'A building can have up to 10 extra managers.',
  demo_manager_hint: 'Demo: type any email and password.',
  create_account: 'Create manager account', reset_password: 'Reset password', send_reset: 'Send reset link',
  manager_signup_hint: 'For the person who manages a building’s money. Residents do not need an account here.',
  new_manager: 'Manage a building? Create an account', back_to_sign_in: 'Back to sign in', forgot_password: 'Forgot your password?',
  reset_sent: 'If this email has an account, a link to set a new password is on its way.',
  confirm_email: 'Check your email and open the confirmation link, then sign in here.',
  password_changed: 'Password changed', choose_new_password: 'Choose a new password', new_password: 'New password',
  demo_banner: 'Demo mode: sample data, saved only in this browser.', demo_reset: 'Reset sample data',
  cannot_connect: 'Could not connect:',

  new_building: 'Set up your building',
  new_building_hint: 'The apartments are created for you, each with its own password. You can rename them and change each fee later.',
  building_name: 'Building name', floors: 'Floors', per_floor: 'Apartments per floor', monthly_fee: 'Monthly fee',
  currency: 'Currency', new_building_total: '{n} apartments will be created.', create_building: 'Create building',
  sheet_title: 'Apartment passwords',
  sheet_warning: 'Print or write these down now. For security they are shown only this once. To send one by WhatsApp later, open the apartment and press WhatsApp; the app makes a new password for it.',
  sheet_how: 'Residents open this link, then type their apartment number and password:',
  apartment: 'Apartment', floor_n: 'Floor {n}', floor: 'Floor',

  record_payment: 'Record fee payment', add_bill: 'Pay a bill for an apartment', record_bill_payment: 'Record bill repayment',
  add_expense: 'Add expense', add_income: 'Add other income',
  bill_hint: 'A water, gas or other bill you paid from your own pocket for this apartment. It is added to what the apartment owes you, and does not touch the building fund.',
  fees: 'Monthly fees', bills: 'Bills', bill_type: 'Bill', category: 'Category', amount: 'Amount', date: 'Date', note: 'Note',
  confirm_delete_entry: 'Delete this entry? The balances will change.',

  building_balance: 'Building fund balance', unpaid_fees: 'Unpaid fees', paid_ahead: 'Paid in advance',
  bills_owed_to_you: 'Bills owed to you', your_pocket: 'From your own pocket',
  owe_most: 'Owe the most', recent: 'Latest activity', fee_per_month: '{n} a month',
  apartments: 'Apartments', add_apartment: 'Add apartment', search_apartment: 'Search by number or name',
  f_owes: 'Owe money', f_ahead: 'Paid ahead', no_apartments: 'No apartments match.',
  password_prompt: 'New password for apartment {n}. Leave empty to get a random one.', set_password: 'Set password',
  password_is: 'The password for apartment {n} is now:\n\n{pw}\n\nGive it to the resident now. For security it is shown only this once.',
  bills_paid_by_you: 'Bills you paid for them', no_password: 'This apartment has no password yet, so nobody can sign in to it. Press Password to set one.',
  statement: 'Statement', opening_balance: 'Balance brought forward', opening_balance_sub: 'Set by the manager',
  edit_apartment: 'Edit apartment', resident_name: 'Resident name', phone: 'Phone',
  fee_hint: 'A new fee applies from this month. Earlier months keep their amount.',
  opening_hint: 'What the apartment owed before the app. Use a minus sign for credit, e.g. -240 if they paid two months ahead. You can change it any time to correct the balance.',
  delete_apartment: 'Delete apartment', confirm_delete_apartment: 'Delete apartment {n} with all its payments and bills? This cannot be undone.',

  money: 'Money', fees_collected: 'Fees collected', other_income: 'Other income', incl_opening: 'Includes {n} opening balance',
  spent: 'Spent', building_fund: 'Building fund', bills_your_pocket: 'Bills from your pocket',
  bills_tab_hint: 'Bills you paid for apartments and what they repaid. Still owed to you: {n}.',

  maintenance: 'Maintenance', add_job: 'Add job', no_maintenance: 'No maintenance jobs yet.', reported_by: 'Reported by apt {n}',
  edit_job: 'Edit job', job_title: 'What needs doing', details: 'Details', status: 'Status', confirm_delete_job: 'Delete this job?',

  settings: 'Settings', resident_access: 'Resident access',
  resident_access_hint: 'Send this link to the residents. Each one signs in with their apartment number and password.',
  copy_link: 'Copy link', new_passwords_all: 'New passwords for all apartments',
  one_password_hint: 'To change one apartment’s password, open the apartment and press Password.',
  confirm_reset_all: 'Replace the password of every apartment? Everyone will need their new password to sign in.',
  new_passwords: 'Replace passwords',
  building: 'Building', opening_cash: 'Fund balance before the app',
  opening_cash_hint: 'Money that was already in the building fund when you started using the app.',
  your_buildings: 'Your buildings', add_building: 'Add another building', delete_building: 'Delete this building',
  confirm_delete_building: 'This deletes "{name}" with all its apartments, payments and history. It cannot be undone.\n\nType the building name to confirm.',
  name_mismatch: 'The name does not match. Nothing was deleted.', account: 'Account',

  your_balance: 'Your balance', bills_paid_for_you: 'Bills paid for you', unpaid_fees_all: 'Unpaid fees (all apartments)',
  by_month: 'Month by month', month: 'Month', collected: 'Collected', spending_and_income: 'Spending and other income',
  report_problem: 'Report a problem', report_sent: 'Sent to the manager', reported_by_you: 'Reported by you',
  what_is_wrong: 'What is wrong?', my_apartment: 'My apartment', building_money: 'Building money',
};

const ar = {
  ok: 'موافق', cancel: 'إلغاء', save: 'حفظ', delete: 'حذف', deleted: 'تم الحذف', saved: 'تم الحفظ', loading: 'جارٍ التحميل…',
  not_found: 'الصفحة غير موجودة.', home: 'الرئيسية', done: 'تم', print: 'طباعة', edit: 'تعديل', open: 'فتح', current: 'مفتوحة الآن',
  choose: 'اختر…', all: 'الكل', send: 'إرسال', copied: 'تم النسخ', nothing_yet: 'لا يوجد شيء بعد.',
  sign_in: 'دخول', sign_out: 'خروج', password: 'كلمة السر', email: 'البريد الإلكتروني',

  owes: 'مستحق {n}', advance: 'مدفوع مقدماً {n}', settled: 'لا شيء مستحق', apt: 'شقة {n}',
  'k.due': 'الاشتراك الشهري', 'k.payment': 'سداد اشتراك', 'k.bill': 'فاتورة دفعها المدير', 'k.bill_payment': 'سداد فاتورة',
  'k.expense': 'مصروف', 'k.income': 'إيراد آخر',
  'cat.maintenance': 'صيانة', 'cat.elevator': 'المصعد', 'cat.cleaning': 'نظافة', 'cat.electricity': 'كهرباء',
  'cat.water': 'مياه', 'cat.gas': 'غاز', 'cat.salaries': 'مرتبات', 'cat.other': 'أخرى',
  'st.open': 'مفتوحة', 'st.progress': 'جارٍ العمل', 'st.done': 'تمت',

  'err.wrong_login': 'كود العمارة أو رقم الشقة أو كلمة السر غير صحيح.',
  'err.locked': 'محاولات خاطئة كثيرة. حاول مرة أخرى بعد 15 دقيقة.',
  'err.not_allowed': 'غير مسموح لك بهذا الإجراء.',
  'err.bad_input': 'راجع البيانات وحاول مرة أخرى.',
  'err.bad_amount': 'أدخل مبلغاً أكبر من صفر.',
  'err.too_many_buildings': 'لقد أنشأت 5 عمارات وهذا هو الحد الأقصى.',
  'err.short_password': 'كلمة السر يجب ألا تقل عن 4 حروف أو أرقام.',
  'err.session_expired': 'من فضلك سجّل الدخول مرة أخرى.',
  'err.too_many_reports': 'لديك 5 بلاغات مفتوحة. انتظر حتى يغلق المدير أحدها.',
  'err.label_taken': 'يوجد شقة أخرى بنفس الرقم.',
  'err.Invalid login credentials': 'البريد الإلكتروني أو كلمة السر غير صحيحة.',

  resident: 'ساكن', manager: 'المدير',
  building_code: 'كود العمارة', apartment_number: 'رقم أو كود الشقة',
  resident_login_hint: 'مدير العمارة يعطيك كود العمارة وكلمة السر الخاصة بشقتك.',
  demo_resident_hint: 'تجربة: العمارة DEMO01، أي شقة من F1-R إلى F11-L، كلمة السر 1234.',
  apt_hint: 'مثلاً F3-R: الدور 3 الشقة اليمين، و F3-L الشقة الشمال.',
  'k.extra': 'رسوم إضافية', add_extra: 'إضافة رسوم إضافية', all_apartments: 'كل الشقق ({n})', extra_what: 'الغرض منها',
  extra_hint: 'مبلغ لمرة واحدة فوق الاشتراك الشهري، مثلاً لمشروع تطوير. يُضاف إلى ما على الشقة للعمارة.',
  balance_now: 'رصيد الاشتراكات الآن',
  balance_now_hint: 'ما على الشقة من اشتراكات الآن. اكتب الرقم الفعلي لتصحيحه: 1000 إذا كان عليها 1000، و -400 إذا دفعت 400 مقدماً. الفواتير التي دفعتها عنها تُحسب منفصلة.',
  edit_all: 'تعديل الكل', save_all: 'حفظ الكل',
  edit_all_hint: 'عدّل الأسماء والهواتف والاشتراكات والأرصدة لكل الشقق من هنا. الرصيد: ما على الشقة من اشتراكات الآن، واستخدم علامة السالب للمدفوع مقدماً.',
  n_saved: 'تم تحديث {n} شقة', nothing_changed: 'لم يتغير شيء.',
  whatsapp: 'واتساب',
  wa_msg: 'السلام عليكم، معكم مدير العمارة.\nشقة {apt} في {building}: {status}.\n\nحسابكم: {link}\nكود العمارة: {code}\nالشقة: {apt}\nكلمة السر: {pw}',
  wa_no_password: 'حفاظاً على الأمان لا يحتفظ التطبيق بكلمة سر الشقة {n}، فلا يمكن وضعها في الرسالة. إنشاء كلمة سر جديدة وإرسالها؟ كلمة السر القديمة ستتوقف عن العمل.',
  wa_new_password: 'كلمة سر جديدة وإرسال',
  login_details: 'اسم الدخول',
  password_hidden: 'حفاظاً على الأمان تظهر كلمات السر مرة واحدة فقط عند إنشائها. لإعطاء الساكن كلمة السر مرة أخرى اضغط «كلمة السر» لتعيين كلمة جديدة.',
  statement_pdf: 'كشف حساب PDF', report_pdf: 'تقرير (PDF)', pdf_download: 'تنزيل PDF', pdf_making: 'جارٍ إنشاء الملف…',
  pdf_failed: 'تعذر إنشاء ملف PDF. تأكد من الاتصال، أو اضغط «طباعة» واختر «حفظ بتنسيق PDF».',
  rp_building_report: 'تقرير العمارة', rp_statement_of: 'كشف حساب الشقة {n}',
  rp_from_to: 'من {from} إلى {to}', rp_until: 'كل الحركات حتى {to}', rp_made_on: 'تاريخ التقرير {d}',
  rp_this_month: 'هذا الشهر', rp_last_month: 'الشهر الماضي', rp_this_year: 'هذه السنة', rp_all_time: 'كل الفترات',
  rp_from: 'من', rp_to: 'إلى',
  rp_period_totals: 'خلال هذه الفترة', rp_now: 'اليوم', rp_net: 'الوارد ناقص المصروف', rp_bills_owed: 'فواتير مستحقة للمدير',
  rp_paid_period: 'المدفوع في الفترة', rp_fee_balance: 'رصيد الاشتراكات', rp_total: 'الإجمالي', rp_movements: 'صندوق العمارة: الوارد والمصروف',
  rp_item: 'البيان', rp_in: 'وارد', rp_out: 'مصروف', rp_charged: 'مستحق', rp_paid: 'مدفوع', rp_total_now: 'إجمالي المستحق الآن',
  backups: 'النسخ الاحتياطي والاسترجاع',
  backups_hint: 'يحفظ التطبيق نسخة من بيانات العمارة تلقائياً مرة كل يوم يفتحه فيه أحد المديرين، ويحتفظ بآخر 30 نسخة. زر «نسخة احتياطية الآن» يحفظ نسخة إضافية وينزّلها كملف؛ احتفظ بهذا الملف في مكان آمن من وقت لآخر.',
  backup_now: 'نسخة احتياطية الآن', restore_file: 'استرجاع من ملف', restore: 'استرجاع', download: 'تنزيل',
  backup_saved: 'تم حفظ النسخة', no_backups: 'لا توجد نسخ بعد.', show_all_n: 'عرض الكل ({n})',
  backup_counts: '{units} شقة، {entries} حركة',
  'bk.auto': 'تلقائية', 'bk.manual': 'من أحد المديرين', 'bk.before_restore': 'قبل استرجاع',
  confirm_restore: 'الرجوع إلى نسخة {when}؟\n\nتحتوي على {units} شقة و{entries} حركة. الشقق والأرصدة والمدفوعات والفواتير والصيانة ترجع كما كانت وقتها، وكل ما سُجّل بعدها يُحذف.\n\nتُحفظ بيانات العمارة الحالية أولاً، فيمكنك التراجع عن ذلك.',
  restored: 'تم استرجاع النسخة. سيُعاد تحميل الصفحة.',
  'err.bad_backup': 'هذا ليس ملف نسخة احتياطية لهذا التطبيق.',
  'err.backup_other_building': 'هذه النسخة تخص عمارة أخرى.',
  'err.no_connection': 'لا يوجد اتصال.',
  'err.JWT expired': 'انتهت مدة الدخول. أغلق التطبيق وافتحه مرة أخرى ثم سجّل الدخول.',
  install_app: 'تثبيت التطبيق على هذا الجهاز',
  install_ios: 'للتثبيت: اضغط زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».',
  numbering: 'أسماء الشقق', numbering_coded: 'حسب الدور: {x}', numbering_plain: 'أرقام: 1، 2، 3 …',
  rename_apartments: 'إعادة تسمية الشقق', rename_hint: 'يعيد تسمية كل الشقق حسب الدور. الأرصدة وكلمات السر تبقى كما هي، لكن السكان يدخلون بالاسم الجديد.',
  rename_coded: 'استخدام كود الدور (F1-R …)', rename_plain: 'استخدام أرقام (1، 2، 3 …)',
  confirm_rename: 'إعادة تسمية كل الشقق؟ سيدخل السكان بالأسماء الجديدة.',
  managers: 'المديرون', managers_hint: 'المديرون الآخرون يستطيعون كل ما تستطيعه، ما عدا إضافة أو حذف المديرين وحذف العمارة. يجب أن ينشئوا حساب مدير أولاً.',
  owner: 'المالك', add_manager: 'إضافة مدير', manager_email: 'بريده الإلكتروني', remove: 'إزالة',
  confirm_remove_manager: 'إزالة {email} من مديري هذه العمارة؟',
  'err.owner_only': 'هذا الإجراء لمالك العمارة فقط.',
  'err.no_account': 'لا يوجد حساب مدير بهذا البريد. اطلب منه إنشاء حساب في التطبيق أولاً.',
  'err.too_many_managers': 'الحد الأقصى 10 مديرين إضافيين للعمارة.',
  demo_manager_hint: 'تجربة: اكتب أي بريد إلكتروني وأي كلمة سر.',
  create_account: 'إنشاء حساب مدير', reset_password: 'استرجاع كلمة السر', send_reset: 'إرسال رابط الاسترجاع',
  manager_signup_hint: 'للشخص المسؤول عن أموال العمارة. السكان لا يحتاجون إلى حساب هنا.',
  new_manager: 'تدير عمارة؟ أنشئ حساباً', back_to_sign_in: 'العودة إلى الدخول', forgot_password: 'نسيت كلمة السر؟',
  reset_sent: 'إذا كان لهذا البريد حساب فسيصله رابط لتعيين كلمة سر جديدة.',
  confirm_email: 'افتح رابط التأكيد الذي وصلك على البريد ثم سجّل الدخول هنا.',
  password_changed: 'تم تغيير كلمة السر', choose_new_password: 'اختر كلمة سر جديدة', new_password: 'كلمة السر الجديدة',
  demo_banner: 'وضع التجربة: بيانات تجريبية محفوظة في هذا المتصفح فقط.', demo_reset: 'إعادة البيانات التجريبية',
  cannot_connect: 'تعذر الاتصال:',

  new_building: 'إعداد العمارة',
  new_building_hint: 'تُنشأ الشقق تلقائياً ولكل شقة كلمة سر خاصة بها. يمكنك تغيير أرقامها واشتراك كل شقة لاحقاً.',
  building_name: 'اسم العمارة', floors: 'عدد الأدوار', per_floor: 'عدد الشقق في الدور', monthly_fee: 'الاشتراك الشهري',
  currency: 'العملة', new_building_total: 'سيتم إنشاء {n} شقة.', create_building: 'إنشاء العمارة',
  sheet_title: 'كلمات سر الشقق',
  sheet_warning: 'اطبعها أو اكتبها الآن، فهي تظهر هذه المرة فقط حفاظاً على الأمان. لإرسال كلمة سر بالواتساب لاحقاً افتح الشقة واضغط «واتساب» وسيُنشئ التطبيق كلمة سر جديدة.',
  sheet_how: 'يفتح السكان هذا الرابط ثم يكتبون رقم الشقة وكلمة السر:',
  apartment: 'الشقة', floor_n: 'الدور {n}', floor: 'الدور',

  record_payment: 'تسجيل سداد اشتراك', add_bill: 'دفع فاتورة عن شقة', record_bill_payment: 'تسجيل سداد فاتورة',
  add_expense: 'إضافة مصروف', add_income: 'إضافة إيراد آخر',
  bill_hint: 'فاتورة مياه أو غاز أو غيرها دفعتها من جيبك عن هذه الشقة. تُضاف إلى ما على الشقة لك ولا تؤثر على صندوق العمارة.',
  fees: 'الاشتراكات الشهرية', bills: 'الفواتير', bill_type: 'الفاتورة', category: 'البند', amount: 'المبلغ', date: 'التاريخ', note: 'ملاحظة',
  confirm_delete_entry: 'حذف هذه الحركة؟ ستتغير الأرصدة.',

  building_balance: 'رصيد صندوق العمارة', unpaid_fees: 'اشتراكات غير مسددة', paid_ahead: 'مدفوع مقدماً',
  bills_owed_to_you: 'فواتير مستحقة لك', your_pocket: 'من جيبك الخاص',
  owe_most: 'الأكثر مديونية', recent: 'آخر الحركات', fee_per_month: '{n} شهرياً',
  apartments: 'الشقق', add_apartment: 'إضافة شقة', search_apartment: 'ابحث بالرقم أو الاسم',
  f_owes: 'عليهم مبالغ', f_ahead: 'دفعوا مقدماً', no_apartments: 'لا توجد شقق مطابقة.',
  password_prompt: 'كلمة السر الجديدة للشقة {n}. اتركها فارغة للحصول على كلمة عشوائية.', set_password: 'تعيين كلمة السر',
  password_is: 'كلمة السر للشقة {n} الآن:\n\n{pw}\n\nأعطها للساكن الآن، فهي تظهر هذه المرة فقط حفاظاً على الأمان.',
  bills_paid_by_you: 'فواتير دفعتها عنهم', no_password: 'هذه الشقة ليس لها كلمة سر بعد، فلا يمكن الدخول إليها. اضغط «كلمة السر» لتعيينها.',
  statement: 'كشف الحساب', opening_balance: 'رصيد سابق مرحّل', opening_balance_sub: 'يحدده المدير',
  edit_apartment: 'تعديل الشقة', resident_name: 'اسم الساكن', phone: 'الهاتف',
  fee_hint: 'الاشتراك الجديد يُطبق من هذا الشهر. الشهور السابقة تبقى كما هي.',
  opening_hint: 'ما كان على الشقة قبل استخدام التطبيق. استخدم علامة السالب للرصيد الدائن، مثلاً -240 إذا دفعوا شهرين مقدماً. يمكنك تغييره في أي وقت لتصحيح الرصيد.',
  delete_apartment: 'حذف الشقة', confirm_delete_apartment: 'حذف الشقة {n} مع كل مدفوعاتها وفواتيرها؟ لا يمكن التراجع.',

  money: 'الأموال', fees_collected: 'اشتراكات محصّلة', other_income: 'إيرادات أخرى', incl_opening: 'تشمل {n} رصيداً افتتاحياً',
  spent: 'المصروفات', building_fund: 'صندوق العمارة', bills_your_pocket: 'فواتير من جيبك',
  bills_tab_hint: 'الفواتير التي دفعتها عن الشقق وما تم سداده. المتبقي لك: {n}.',

  maintenance: 'الصيانة', add_job: 'إضافة عمل', no_maintenance: 'لا توجد أعمال صيانة بعد.', reported_by: 'بلاغ من شقة {n}',
  edit_job: 'تعديل العمل', job_title: 'المطلوب عمله', details: 'التفاصيل', status: 'الحالة', confirm_delete_job: 'حذف هذا العمل؟',

  settings: 'الإعدادات', resident_access: 'دخول السكان',
  resident_access_hint: 'أرسل هذا الرابط إلى السكان. كل ساكن يدخل برقم شقته وكلمة السر.',
  copy_link: 'نسخ الرابط', new_passwords_all: 'كلمات سر جديدة لكل الشقق',
  one_password_hint: 'لتغيير كلمة سر شقة واحدة افتح الشقة واضغط «كلمة السر».',
  confirm_reset_all: 'تغيير كلمة السر لكل الشقق؟ سيحتاج الجميع إلى كلمة السر الجديدة للدخول.',
  new_passwords: 'تغيير كلمات السر',
  building: 'العمارة', opening_cash: 'رصيد الصندوق قبل التطبيق',
  opening_cash_hint: 'المبلغ الذي كان في صندوق العمارة عند بدء استخدام التطبيق.',
  your_buildings: 'عماراتك', add_building: 'إضافة عمارة أخرى', delete_building: 'حذف هذه العمارة',
  confirm_delete_building: 'سيتم حذف «{name}» مع كل الشقق والمدفوعات والسجل. لا يمكن التراجع.\n\nاكتب اسم العمارة للتأكيد.',
  name_mismatch: 'الاسم غير مطابق. لم يُحذف شيء.', account: 'الحساب',

  your_balance: 'رصيدك', bills_paid_for_you: 'فواتير دُفعت عنك', unpaid_fees_all: 'اشتراكات غير مسددة (كل الشقق)',
  by_month: 'شهراً بشهر', month: 'الشهر', collected: 'المحصّل', spending_and_income: 'المصروفات والإيرادات الأخرى',
  report_problem: 'الإبلاغ عن مشكلة', report_sent: 'تم الإرسال إلى المدير', reported_by_you: 'بلاغ منك',
  what_is_wrong: 'ما المشكلة؟', my_apartment: 'شقتي', building_money: 'أموال العمارة',
};

const dict = lang === 'ar' ? ar : en;

export const has = (key) => Object.hasOwn(dict, key) || Object.hasOwn(en, key);

export function t(key, vars) {
  let s = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll('{' + k + '}', v);
  return s;
}
