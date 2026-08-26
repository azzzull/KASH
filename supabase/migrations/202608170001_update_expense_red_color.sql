update public.categories
set color = '#E50914'
where category_type = 'expense'
  and is_system = true
  and name in (
    'Food & Drink',
    'Transportation',
    'Shopping',
    'Bills',
    'Entertainment',
    'Health',
    'Education',
    'Lifestyle',
    'Travel',
    'Family',
    'Donation'
  );
