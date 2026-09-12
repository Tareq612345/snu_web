// structure.js - الهيكل الجامعي الشامل (محدث: إضافة الأسنان، العلاج الطبيعي، وفصل هندسة البترول)

export const UNIVERSITY_STRUCTURE = [
    // 1. كلية اللغات والعلوم الإنسانية
    {
        id: "languages_humanities",
        name: "كلية اللغات والعلوم الإنسانية",
        departments: [
            { id: "chinese", name: "قسم اللغة الصينية" },
            { id: "english_trans", name: "قسم الإنجليزية والترجمة التخصصية" }
        ]
    },

    // 2. كلية الأعمال والعلوم السياسية
    {
        id: "business_politics",
        name: "كلية الأعمال والعلوم السياسية",
        departments: [
            { id: "bis", name: "قسم نظم ومعلومات الأعمال" },
            { id: "supply_chain", name: "قسم إدارة سلاسل التوريد واللوجستيات" },
            { id: "economics", name: "قسم الاقتصاد والدراسات التنموية" },
            { id: "poli_sci", name: "قسم العلوم السياسية والدراسات الاستراتيجية" },
            { id: "biz_ai", name: "قسم تحليل الأعمال باستخدام الذكاء الاصطناعي" }
        ]
    },

    // 3. كلية الإعلام
    {
        id: "mass_comm",
        name: "كلية الإعلام",
        departments: [
            { id: "web_journalism", name: "قسم صحافة الويب والإعلام التفاعلي" },
            { id: "broadcast_tv", name: "قسم الإعلام الإذاعي والتلفزيون الرقمي" },
            { id: "digital_pr", name: "قسم العلاقات العامة الرقمية" },
            { id: "film_prod", name: "قسم الإنتاج السينمائي" }
        ]
    },

    // 4. كلية الهندسة (تم فصل البترول عنها)
    {
        id: "engineering",
        name: "كلية الهندسة",
        departments: [
            { id: "smart_electric", name: "قسم هندسة النظم الكهربية الذكية" },
            { id: "smart_comms", name: "قسم نظم الاتصالات والحاسبات الذكية" },
            { id: "sustainable_struct", name: "قسم المنشآت الذكية المستدامة" }
        ]
    },

    // 5. كلية هندسة البترول (جديدة - منفصلة)
    {
        id: "petroleum_college",
        name: "كلية هندسة البترول",
        departments: [
            { id: "petroleum_gas", name: "قسم هندسة البترول والغاز" }
        ]
    },

    // 6. كلية العلوم
    {
        id: "science",
        name: "كلية العلوم",
        departments: [
            { id: "math_cs", name: "قسم الرياضيات وعلوم الحاسب" },
            { id: "micro_bio", name: "قسم الميكروبيولوجي والكيمياء الحيوية" },
            { id: "petro_geology", name: "قسم جيولوجيا البترول والغاز الطبيعي" },
            { id: "biotech", name: "قسم التكنولوجيا الحيوية والبيولوجية الجزيئية" }
        ]
    },

    // 7. كلية الحاسبات والمعلومات
    {
        id: "fci",
        name: "كلية الحاسبات والمعلومات",
        departments: [
            { id: "ai", name: "قسم الذكاء الاصطناعي" },
            { id: "cyber", name: "قسم الأمن السيبراني" }
        ]
    },

    // 8. كلية الفنون التطبيقية
    {
        id: "applied_arts",
        name: "كلية الفنون التطبيقية",
        departments: [
            { id: "fashion_design", name: "قسم الموضة وتصميم المنتجات" },
            { id: "interior_design", name: "قسم تصميم العمارة الداخلية والأثاث" },
            { id: "ad_marketing", name: "قسم تصميم الإعلان والتسويق الرقمي" },
            { id: "digital_arts", name: "قسم الفنون الرقمية والجرافيك" }
        ]
    },

    // 9. طب الأسنان (الكلية هي القسم)
    {
        id: "dentistry",
        name: "طب الأسنان",
        departments: [
            { id: "dentistry_general", name: "طب الأسنان (عام)" }
        ]
    },

    // 10. العلاج الطبيعي (الكلية هي القسم)
    {
        id: "physical_therapy",
        name: "العلاج الطبيعي",
        departments: [
            { id: "pt_general", name: "العلاج الطبيعي (عام)" }
        ]
    }
];

// دالة مساعدة لجلب الاسم بالعربي (للاستخدام في البروفايل ولوحة التحكم)
export const getStructureName = (colId, deptId) => {
    const col = UNIVERSITY_STRUCTURE.find(c => c.id === colId);
    
    // في حالة لم يتم العثور على الكلية
    if (!col) return { colName: "غير معروف", deptName: "غير معروف" };
    
    // في حالة القسم العام للكلية
    if (deptId === 'all') return { colName: col.name, deptName: "عام لكل الكلية" };

    const dept = col.departments.find(d => d.id === deptId);
    
    return {
        colName: col.name,
        deptName: dept ? dept.name : deptId 
    };
};