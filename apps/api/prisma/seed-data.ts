/** Static catalogue and company data for the seed. Prices in cents. */

export const ALLERGENS = ['Dairy', 'Gluten', 'Nuts', 'Peanuts', 'Soy', 'Sesame', 'Egg', 'Mustard'];
export const DIETARY = ['Vegan', 'Vegetarian', 'Jain', 'Gluten-free', 'High protein', 'Dairy-free'];
export const STATIONS = ['Tandoor', 'Curry & Rice', 'Cold Prep', 'Grill', 'Pastry'];
export const PORTIONS = ['Regular', 'Large'];
export const PACKAGING = ['Compostable box', 'Reusable tiffin', 'Individually labelled bag'];

export interface OptionSeed {
  name: string;
  cost: number;
  price: number; // Standard tier
  allergens?: string[];
  dietary?: string[];
  portions?: boolean;
}

export const OPTIONS: OptionSeed[] = [
  { name: 'Paneer', cost: 120, price: 250, allergens: ['Dairy'], dietary: ['Vegetarian', 'High protein'], portions: true },
  { name: 'Tofu', cost: 90, price: 200, allergens: ['Soy'], dietary: ['Vegan', 'High protein'], portions: true },
  { name: 'Chickpeas', cost: 40, price: 100, dietary: ['Vegan', 'Jain', 'Gluten-free'], portions: true },
  { name: 'Tandoori chicken', cost: 160, price: 350, allergens: ['Dairy'], dietary: ['High protein', 'Gluten-free'], portions: true },
  { name: 'Brown rice', cost: 25, price: 0, dietary: ['Vegan', 'Gluten-free', 'Jain'] },
  { name: 'Jeera rice', cost: 25, price: 0, dietary: ['Vegan', 'Gluten-free', 'Jain'] },
  { name: 'Quinoa', cost: 60, price: 150, dietary: ['Vegan', 'Gluten-free'] },
  { name: 'Raita', cost: 30, price: 125, allergens: ['Dairy'], dietary: ['Vegetarian', 'Gluten-free'] },
  { name: 'Mint chutney', cost: 10, price: 50, dietary: ['Vegan', 'Gluten-free', 'Jain'] },
  { name: 'Mango pickle', cost: 10, price: 50, allergens: ['Mustard'], dietary: ['Vegan', 'Gluten-free'] },
  { name: 'Butter naan', cost: 30, price: 175, allergens: ['Gluten', 'Dairy'], dietary: ['Vegetarian'] },
  { name: 'Roti', cost: 15, price: 100, allergens: ['Gluten'], dietary: ['Vegan'] },
  { name: 'Whole wheat wrap', cost: 25, price: 0, allergens: ['Gluten'], dietary: ['Vegan'] },
  { name: 'Spinach wrap', cost: 30, price: 50, allergens: ['Gluten'], dietary: ['Vegan'] },
  { name: 'Masala chai', cost: 20, price: 225, allergens: ['Dairy'], dietary: ['Vegetarian'] },
  { name: 'Fresh lime soda', cost: 15, price: 200, dietary: ['Vegan', 'Gluten-free', 'Jain'] },
  { name: 'Oat milk', cost: 15, price: 50, dietary: ['Vegan', 'Dairy-free'] },
  { name: 'Mild', cost: 0, price: 0, dietary: ['Vegan', 'Jain'] },
  { name: 'Medium', cost: 0, price: 0, dietary: ['Vegan', 'Jain'] },
  { name: 'Hot', cost: 0, price: 0, dietary: ['Vegan', 'Jain'] },
];

export interface GroupSeed {
  name: string;
  required: boolean;
  options: string[];
  portions?: { Regular: number; Large: number };
}

export interface DishSeed {
  sku: string;
  name: string;
  description: string;
  temp: 'HOT' | 'COLD';
  cost: number;
  price: number | null; // Standard tier; null = no Standard price yet
  station: string | null;
  allergens?: string[];
  dietary?: string[];
  minQty?: number;
  groups?: GroupSeed[];
  categories: string[];
  active?: boolean;
}

const protein = (opts = ['Paneer', 'Tofu', 'Chickpeas']): GroupSeed => ({
  name: 'Choose your protein', required: true, options: opts, portions: { Regular: 0, Large: 150 },
});
const rice: GroupSeed = { name: 'Choose your base', required: true, options: ['Brown rice', 'Jeera rice', 'Quinoa'] };
const spice: GroupSeed = { name: 'Spice level', required: true, options: ['Mild', 'Medium', 'Hot'] };
const side: GroupSeed = { name: 'Add a side', required: false, options: ['Raita', 'Mint chutney', 'Mango pickle'] };
const bread: GroupSeed = { name: 'Add bread', required: false, options: ['Butter naan', 'Roti'] };
const wrap: GroupSeed = { name: 'Choose your wrap', required: true, options: ['Whole wheat wrap', 'Spinach wrap'] };

export const DISHES: DishSeed[] = [
  { sku: '1001', name: 'Paneer Tikka Rice Bowl', description: 'Charred paneer tikka over your choice of grain with pickled onions and coriander.', temp: 'HOT', cost: 380, price: 1195, station: 'Tandoor', allergens: ['Dairy'], dietary: ['Vegetarian'], groups: [protein(['Paneer', 'Tofu']), rice, spice, side], categories: ['bowls'] },
  { sku: '1002', name: 'Chana Masala Bowl', description: 'Slow-cooked chickpeas in onion-tomato masala, finished with lemon and ginger.', temp: 'HOT', cost: 260, price: 1050, station: 'Curry & Rice', dietary: ['Vegan', 'Gluten-free'], groups: [rice, spice, side, bread], categories: ['bowls'] },
  { sku: '1003', name: 'Dal Makhani Bowl', description: 'Black lentils simmered overnight with butter and cream.', temp: 'HOT', cost: 240, price: 995, station: 'Curry & Rice', allergens: ['Dairy'], dietary: ['Vegetarian', 'Gluten-free'], groups: [rice, side, bread], categories: ['bowls'] },
  { sku: '1004', name: 'Tandoori Chicken Bowl', description: 'Yoghurt-marinated chicken from the tandoor with kachumber salad.', temp: 'HOT', cost: 450, price: 1395, station: 'Tandoor', allergens: ['Dairy'], dietary: ['High protein', 'Gluten-free'], groups: [rice, spice, side], categories: ['bowls'] },
  { sku: '1005', name: 'Jain Rajma Bowl', description: 'Kidney beans cooked without onion, garlic or root vegetables.', temp: 'HOT', cost: 230, price: 995, station: 'Curry & Rice', dietary: ['Vegan', 'Jain', 'Gluten-free'], groups: [rice], categories: ['bowls'] },
  { sku: '1006', name: 'Build-your-own Thali', description: 'Two curries, rice, bread and a side. Pick your protein and size.', temp: 'HOT', cost: 520, price: 1595, station: 'Curry & Rice', allergens: ['Gluten'], groups: [protein(), rice, bread, side], categories: ['bowls', 'chefs-table'], minQty: 5 },
  { sku: '2001', name: 'Kathi Roll', description: 'Flaky wrap rolled with spiced filling, onions and green chutney.', temp: 'HOT', cost: 300, price: 1050, station: 'Grill', allergens: ['Gluten'], groups: [protein(['Paneer', 'Tofu', 'Tandoori chicken']), wrap, spice], categories: ['wraps'] },
  { sku: '2002', name: 'Falafel Wrap', description: 'Herbed falafel, hummus, pickled turnip and tahini.', temp: 'COLD', cost: 270, price: 995, station: 'Cold Prep', allergens: ['Gluten', 'Sesame'], dietary: ['Vegan'], groups: [wrap], categories: ['wraps'] },
  { sku: '2003', name: 'Aloo Tikki Burger', description: 'Spiced potato patty, tamarind chutney and slaw on a brioche bun.', temp: 'HOT', cost: 250, price: 950, station: 'Grill', allergens: ['Gluten', 'Egg'], dietary: ['Vegetarian'], categories: ['wraps'] },
  { sku: '3001', name: 'Masala Oats', description: 'Savoury oats with vegetables, curry leaves and mustard seeds.', temp: 'HOT', cost: 150, price: 695, station: 'Curry & Rice', allergens: ['Mustard'], dietary: ['Vegan'], categories: ['breakfast'] },
  { sku: '3002', name: 'Poha', description: 'Flattened rice with peanuts, turmeric, onion and lime.', temp: 'HOT', cost: 120, price: 650, station: 'Curry & Rice', allergens: ['Peanuts'], dietary: ['Vegan', 'Gluten-free'], categories: ['breakfast'] },
  { sku: '3003', name: 'Masala Omelette Wrap', description: 'Two-egg omelette with green chilli and onion in a paratha.', temp: 'HOT', cost: 210, price: 850, station: 'Grill', allergens: ['Egg', 'Gluten'], dietary: ['Vegetarian', 'High protein'], categories: ['breakfast'] },
  { sku: '3004', name: 'Overnight Chia Pot', description: 'Chia, oat milk, mango and toasted coconut.', temp: 'COLD', cost: 190, price: 750, station: 'Cold Prep', dietary: ['Vegan', 'Gluten-free'], categories: ['breakfast'] },
  { sku: '4001', name: 'Chaat Salad', description: 'Chickpeas, potato, pomegranate, sev and yoghurt with tamarind.', temp: 'COLD', cost: 230, price: 950, station: 'Cold Prep', allergens: ['Dairy', 'Gluten'], dietary: ['Vegetarian'], categories: ['salads'] },
  { sku: '4002', name: 'Quinoa Kachumber', description: 'Quinoa, cucumber, tomato, onion and lemon-cumin dressing.', temp: 'COLD', cost: 210, price: 925, station: 'Cold Prep', dietary: ['Vegan', 'Gluten-free'], groups: [{ name: 'Add protein', required: false, options: ['Paneer', 'Tofu', 'Chickpeas'], portions: { Regular: 0, Large: 150 } }], categories: ['salads'] },
  { sku: '4003', name: 'Sprouted Moong Salad', description: 'Sprouted mung beans with pomegranate and chaat masala.', temp: 'COLD', cost: 160, price: 850, station: 'Cold Prep', dietary: ['Vegan', 'Jain', 'Gluten-free'], categories: ['salads'] },
  { sku: '5001', name: 'Gulab Jamun (2 pc)', description: 'Milk dumplings in cardamom-rose syrup.', temp: 'HOT', cost: 90, price: 450, station: 'Pastry', allergens: ['Dairy', 'Gluten'], dietary: ['Vegetarian'], categories: ['desserts'] },
  { sku: '5002', name: 'Mango Lassi Pudding', description: 'Set yoghurt and Alphonso mango with pistachio.', temp: 'COLD', cost: 110, price: 495, station: 'Pastry', allergens: ['Dairy', 'Nuts'], dietary: ['Vegetarian', 'Gluten-free'], categories: ['desserts'] },
  { sku: '5003', name: 'Coconut Kheer', description: 'Rice pudding with coconut milk and jaggery.', temp: 'COLD', cost: 100, price: 475, station: 'Pastry', dietary: ['Vegan', 'Gluten-free'], categories: ['desserts'] },
  { sku: '5004', name: 'Saffron Pistachio Kulfi', description: 'Seasonal. Not yet priced on Standard.', temp: 'COLD', cost: 140, price: null, station: 'Pastry', allergens: ['Dairy', 'Nuts'], dietary: ['Vegetarian'], categories: ['desserts'] },
  { sku: '6001', name: 'Masala Chai Flask', description: 'Serves one. Choose your milk.', temp: 'HOT', cost: 60, price: 350, station: null, allergens: ['Dairy'], groups: [{ name: 'Milk', required: true, options: ['Masala chai', 'Oat milk'] }], categories: ['beverages'] },
  { sku: '6002', name: 'Fresh Lime Soda', description: 'Sweet, salted or mixed.', temp: 'COLD', cost: 40, price: 325, station: null, dietary: ['Vegan', 'Jain', 'Gluten-free'], categories: ['beverages'] },
  { sku: '6003', name: 'Chef’s Tasting Box', description: 'Five small plates chosen by the chef. Secret menu for partners.', temp: 'HOT', cost: 900, price: 2495, station: 'Tandoor', allergens: ['Dairy', 'Gluten', 'Nuts'], categories: ['chefs-table'] },
  { sku: '9001', name: 'Butter Chicken (retired)', description: 'Replaced by the Tandoori Chicken Bowl.', temp: 'HOT', cost: 420, price: 1295, station: 'Curry & Rice', allergens: ['Dairy'], categories: ['bowls'], active: false },
];

export const CATEGORIES = [
  { slug: 'bowls', name: 'Bowls', secret: false },
  { slug: 'wraps', name: 'Wraps & Rolls', secret: false },
  { slug: 'breakfast', name: 'Breakfast', secret: false },
  { slug: 'salads', name: 'Salads', secret: false },
  { slug: 'desserts', name: 'Desserts', secret: false },
  { slug: 'beverages', name: 'Beverages', secret: false },
  { slug: 'chefs-table', name: 'Chef’s Table', secret: true },
];

export interface CompanySeed {
  name: string;
  domains: string[];
  tier: 'Standard' | 'Enterprise' | 'Partner' | null;
  time: string;
  lead: number;
  workingDays: number[];
  addresses: { label: string; line1: string; city: string; postalCode: string }[];
  instructions: string;
  hiddenCategories?: string[];
  hiddenDishes?: string[];
  people: string[];
}

export const COMPANIES: CompanySeed[] = [
  {
    name: 'Northwind Analytics', domains: ['northwind.io'], tier: 'Enterprise', time: '12:00', lead: 60, workingDays: [1, 2, 3, 4, 5],
    addresses: [
      { label: 'HQ, 14th floor', line1: '350 Fifth Avenue', city: 'New York, NY', postalCode: '10118' },
      { label: 'Studio', line1: '61 Ninth Avenue', city: 'New York, NY', postalCode: '10011' },
    ],
    instructions: 'Check in at the lobby desk. Freight elevator B.',
    people: ['Priya Raman', 'Daniel Okafor', 'Mei Lin', 'Arjun Mehta', 'Sofia Rossi', 'Liam Walsh', 'Hana Suzuki', 'Omar Haddad', 'Grace Kim', 'Ravi Iyer', 'Chloe Martin', 'Noah Fischer', 'Ananya Das', 'Ethan Brooks'],
  },
  {
    name: 'Bluebird Health', domains: ['bluebirdhealth.com', 'bluebird.care'], tier: null, time: '12:30', lead: 45, workingDays: [1, 2, 3, 4, 5],
    addresses: [{ label: 'Clinic HQ', line1: '1 Hudson Yards', city: 'New York, NY', postalCode: '10001' }],
    instructions: 'Deliver to the staff kitchen, not reception.',
    hiddenDishes: ['5001'],
    people: ['Fatima Noor', 'Jack Turner', 'Isabel Cruz', 'Vikram Singh', 'Emma Clarke', 'Kenji Watanabe', 'Aisha Bello', 'Lucas Moreau', 'Neha Kapoor', 'Sam Patel'],
  },
  {
    name: 'Kestrel Robotics', domains: ['kestrelrobotics.com'], tier: 'Partner', time: '11:45', lead: 60, workingDays: [1, 2, 3, 4, 5, 6],
    addresses: [
      { label: 'Lab', line1: '87 Richardson Street', city: 'Brooklyn, NY', postalCode: '11211' },
      { label: 'Assembly floor', line1: '220 36th Street', city: 'Brooklyn, NY', postalCode: '11232' },
    ],
    instructions: 'Ring the loading bay bell. Hard hats beyond the yellow line.',
    people: ['Tom Becker', 'Yuki Tanaka', 'Rohan Joshi', 'Ella Novak', 'Marcus Reed', 'Zara Ahmed', 'Felix Wagner', 'Leah Cohen', 'Karan Malhotra', 'Olivia Hart', 'Diego Alvarez'],
  },
  {
    name: 'Harbor & Pine Legal', domains: ['harborpine.law'], tier: 'Standard', time: '13:00', lead: 60, workingDays: [1, 2, 3, 4, 5],
    addresses: [{ label: 'Main office', line1: '120 Broadway, 30th floor', city: 'New York, NY', postalCode: '10271' }],
    instructions: 'Security needs names 10 minutes before arrival.',
    hiddenCategories: ['breakfast'],
    people: ['Catherine Doyle', 'Arthur Bennett', 'Meera Pillai', 'James Whitaker', 'Nadia Petrova', 'Samuel Adeyemi', 'Rebecca Stone', 'Aditya Rao'],
  },
  {
    name: 'Copperleaf Studios', domains: ['copperleaf.studio'], tier: null, time: '12:15', lead: 30, workingDays: [3, 4, 5, 6, 7],
    addresses: [{ label: 'Studio', line1: '45 Main Street', city: 'Brooklyn, NY', postalCode: '11201' }],
    instructions: 'Leave with the front desk if no one answers.',
    people: ['Maya Goldberg', 'Theo Laurent', 'Ishaan Verma', 'Ruby Chen', 'Oscar Lindqvist', 'Tara Shah', 'Ben Carter'],
  },
];
